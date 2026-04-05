from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel, Field

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── Pydantic スキーマ ──────────────────────────────────────────────────────────

class OperationOut(BaseModel):
    id: int
    sequence: int
    machine_id: int
    process_id: Optional[int]
    duration_hours: float
    is_urgent: bool
    planned_start: Optional[datetime]
    planned_end: Optional[datetime]

    class Config:
        from_attributes = True


class OrderBase(BaseModel):
    order_number: str
    product_name: str
    product_code: str
    quantity: int = Field(..., gt=0)
    due_date: date
    priority: int = Field(3, ge=1, le=3)
    status: str = "pending"
    note: Optional[str] = None


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    quantity: Optional[int] = Field(None, gt=0)
    due_date: Optional[date] = None
    priority: Optional[int] = Field(None, ge=1, le=3)
    status: Optional[str] = None
    note: Optional[str] = None


class OrderOut(OrderBase):
    id: int
    created_at: datetime
    operations: List[OperationOut] = []

    class Config:
        from_attributes = True


class OrderListOut(BaseModel):
    total: int
    items: List[OrderOut]


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("", response_model=OrderListOut)
def list_orders(
    status: Optional[str] = Query(None),
    priority: Optional[int] = Query(None, ge=1, le=3),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    q = db.query(models.Order).filter(models.Order.tenant_id == tenant_id)
    if status:
        q = q.filter(models.Order.status == status)
    if priority is not None:
        q = q.filter(models.Order.priority == priority)
    q = q.order_by(models.Order.priority, models.Order.due_date)
    orders = q.all()
    return {"total": len(orders), "items": orders}


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    # テナント内での受注番号重複チェック
    if db.query(models.Order).filter(
        models.Order.tenant_id == tenant_id,
        models.Order.order_number == payload.order_number,
    ).first():
        raise HTTPException(status_code=409, detail="受注番号が既に存在します")

    order = models.Order(**payload.model_dump(), tenant_id=tenant_id)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    order = db.query(models.Order).filter(
        models.Order.id == order_id,
        models.Order.tenant_id == tenant_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")
    return order


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    order = db.query(models.Order).filter(
        models.Order.id == order_id,
        models.Order.tenant_id == tenant_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, key, value)
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    order = db.query(models.Order).filter(
        models.Order.id == order_id,
        models.Order.tenant_id == tenant_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")
    db.delete(order)
    db.commit()


# ── 工程（Operation）管理 ────────────────────────────────────────────────────

class OperationCreate(BaseModel):
    machine_id: int
    process_id: Optional[int] = None
    duration_hours: float = Field(..., gt=0)
    is_urgent: bool = False


class OperationUpdate(BaseModel):
    machine_id: Optional[int] = None
    process_id: Optional[int] = None
    duration_hours: Optional[float] = Field(None, gt=0)
    is_urgent: Optional[bool] = None


def _get_order_or_404(order_id: int, tenant_id: int, db: Session) -> models.Order:
    order = db.query(models.Order).filter(
        models.Order.id == order_id,
        models.Order.tenant_id == tenant_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")
    return order


@router.get("/{order_id}/operations", response_model=List[OperationOut])
def list_operations(
    order_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """受注に紐づく工程一覧を返す（sequence順）。"""
    _get_order_or_404(order_id, tenant_id, db)
    return (
        db.query(models.Operation)
        .filter(
            models.Operation.order_id == order_id,
            models.Operation.tenant_id == tenant_id,
        )
        .order_by(models.Operation.sequence)
        .all()
    )


@router.post("/{order_id}/operations", response_model=OperationOut, status_code=201)
def add_operation(
    order_id: int,
    payload: OperationCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """受注に工程を追加する。sequence は既存最大値 + 1 で自動採番。"""
    _get_order_or_404(order_id, tenant_id, db)

    # 設備がこのテナントのものか確認
    machine = db.query(models.Machine).filter(
        models.Machine.id == payload.machine_id,
        models.Machine.tenant_id == tenant_id,
    ).first()
    if not machine:
        raise HTTPException(status_code=404, detail="設備が見つかりません")

    # sequence を自動採番
    last = (
        db.query(models.Operation)
        .filter(
            models.Operation.order_id == order_id,
            models.Operation.tenant_id == tenant_id,
        )
        .order_by(models.Operation.sequence.desc())
        .first()
    )
    next_seq = (last.sequence + 1) if last else 1

    op = models.Operation(
        tenant_id=tenant_id,
        order_id=order_id,
        machine_id=payload.machine_id,
        process_id=payload.process_id,
        sequence=next_seq,
        duration_hours=payload.duration_hours,
        is_urgent=payload.is_urgent,
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return op


@router.put("/{order_id}/operations/{op_id}", response_model=OperationOut)
def update_operation(
    order_id: int,
    op_id: int,
    payload: OperationUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """工程を更新する。"""
    _get_order_or_404(order_id, tenant_id, db)
    op = db.query(models.Operation).filter(
        models.Operation.id == op_id,
        models.Operation.order_id == order_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(op, key, value)
    db.commit()
    db.refresh(op)
    return op


@router.delete("/{order_id}/operations/{op_id}", status_code=204)
def delete_operation(
    order_id: int,
    op_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """工程を削除し、残りの sequence を詰め直す。"""
    _get_order_or_404(order_id, tenant_id, db)
    op = db.query(models.Operation).filter(
        models.Operation.id == op_id,
        models.Operation.order_id == order_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    deleted_seq = op.sequence
    db.delete(op)
    db.flush()

    # sequence を詰め直す
    remaining = (
        db.query(models.Operation)
        .filter(
            models.Operation.order_id == order_id,
            models.Operation.tenant_id == tenant_id,
            models.Operation.sequence > deleted_seq,
        )
        .all()
    )
    for r in remaining:
        r.sequence -= 1

    db.commit()
