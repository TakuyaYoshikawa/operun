"""
原料発注・納入スケジュール管理ルーター
"""

from typing import List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── スキーマ ──────────────────────────────────────────────────────────────────

class PurchaseOrderIn(BaseModel):
    material_id: int
    supplier_name: str
    quantity: float
    unit_price: Optional[float] = None
    order_date: date
    expected_delivery_date: date
    note: Optional[str] = None

class PurchaseOrderUpdate(BaseModel):
    supplier_name: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    expected_delivery_date: Optional[date] = None
    status: Optional[str] = None
    note: Optional[str] = None

class ReceiveIn(BaseModel):
    received_quantity: float
    actual_delivery_date: date
    note: Optional[str] = None

class PurchaseOrderOut(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    unit: str
    po_number: str
    supplier_name: str
    quantity: float
    unit_price: Optional[float]
    order_date: date
    expected_delivery_date: date
    actual_delivery_date: Optional[date]
    received_quantity: Optional[float]
    status: str
    note: Optional[str]
    is_overdue: bool   # 納入予定日超過かつ未入荷

    class Config:
        from_attributes = True


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _gen_po_number(db: Session, tenant_id: int) -> str:
    today = date.today()
    prefix = f"PO-{today.year}-"
    count = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.tenant_id == tenant_id,
        models.PurchaseOrder.po_number.like(f"{prefix}%"),
    ).count()
    return f"{prefix}{count + 1:03d}"


def _to_out(po: models.PurchaseOrder) -> PurchaseOrderOut:
    today = date.today()
    is_overdue = (
        po.status in ("ordered", "partial")
        and po.expected_delivery_date < today
    )
    return PurchaseOrderOut(
        id=po.id,
        material_id=po.material_id,
        material_code=po.material.material_code,
        material_name=po.material.material_name,
        unit=po.material.unit,
        po_number=po.po_number,
        supplier_name=po.supplier_name,
        quantity=po.quantity,
        unit_price=po.unit_price,
        order_date=po.order_date,
        expected_delivery_date=po.expected_delivery_date,
        actual_delivery_date=po.actual_delivery_date,
        received_quantity=po.received_quantity,
        status=po.status,
        note=po.note,
        is_overdue=is_overdue,
    )


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[PurchaseOrderOut])
def list_purchase_orders(
    status: Optional[str] = None,       # ordered / partial / received / cancelled
    material_id: Optional[int] = None,
    days_ahead: Optional[int] = None,   # 今後N日以内の納入予定を絞り込み
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """発注一覧（納入予定日順）"""
    q = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.tenant_id == tenant_id,
    )
    if status:
        q = q.filter(models.PurchaseOrder.status == status)
    if material_id:
        q = q.filter(models.PurchaseOrder.material_id == material_id)
    if days_ahead is not None:
        cutoff = date.today() + timedelta(days=days_ahead)
        q = q.filter(models.PurchaseOrder.expected_delivery_date <= cutoff)

    pos = q.order_by(models.PurchaseOrder.expected_delivery_date).all()
    return [_to_out(po) for po in pos]


@router.post("", response_model=PurchaseOrderOut, status_code=201)
def create_purchase_order(
    payload: PurchaseOrderIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """発注登録"""
    material = db.query(models.Material).filter(
        models.Material.id == payload.material_id,
        models.Material.tenant_id == tenant_id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料が見つかりません")

    po = models.PurchaseOrder(
        tenant_id=tenant_id,
        po_number=_gen_po_number(db, tenant_id),
        **payload.model_dump(),
    )
    db.add(po)
    db.commit()
    db.refresh(po)
    return _to_out(po)


@router.put("/{id}", response_model=PurchaseOrderOut)
def update_purchase_order(
    id: int,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    po = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.id == id,
        models.PurchaseOrder.tenant_id == tenant_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="発注が見つかりません")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(po, k, v)
    db.commit()
    db.refresh(po)
    return _to_out(po)


@router.post("/{id}/receive", response_model=PurchaseOrderOut)
def receive_purchase_order(
    id: int,
    payload: ReceiveIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """入荷確認 — 在庫に自動反映"""
    po = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.id == id,
        models.PurchaseOrder.tenant_id == tenant_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="発注が見つかりません")
    if po.status == "received":
        raise HTTPException(status_code=400, detail="この発注はすでに入荷済みです")

    # 在庫を増やす
    material = po.material
    material.stock_quantity += payload.received_quantity

    # 入出庫ログ
    log = models.MaterialStockLog(
        tenant_id=tenant_id,
        material_id=material.id,
        action="receive",
        quantity=payload.received_quantity,
        note=f"発注番号 {po.po_number} の入荷" + (f" / {payload.note}" if payload.note else ""),
    )
    db.add(log)

    # 発注ステータス更新
    po.received_quantity = payload.received_quantity
    po.actual_delivery_date = payload.actual_delivery_date
    po.status = "received" if payload.received_quantity >= po.quantity else "partial"

    db.commit()
    db.refresh(po)
    return _to_out(po)


@router.delete("/{id}", status_code=204)
def cancel_purchase_order(
    id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """発注キャンセル"""
    po = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.id == id,
        models.PurchaseOrder.tenant_id == tenant_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="発注が見つかりません")
    po.status = "cancelled"
    db.commit()


@router.get("/schedule", response_model=List[PurchaseOrderOut])
def delivery_schedule(
    days_ahead: int = 30,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """今後N日以内の納入予定一覧（カレンダー表示用）"""
    cutoff = date.today() + timedelta(days=days_ahead)
    pos = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.tenant_id == tenant_id,
        models.PurchaseOrder.status.in_(["ordered", "partial"]),
        models.PurchaseOrder.expected_delivery_date <= cutoff,
    ).order_by(models.PurchaseOrder.expected_delivery_date).all()
    return [_to_out(po) for po in pos]
