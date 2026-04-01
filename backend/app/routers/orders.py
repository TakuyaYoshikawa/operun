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
