"""
外注管理ルーター（Phase 3 Feature 14）
"""

from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── スキーマ ──────────────────────────────────────────────────────────────────

class OutsourceOrderIn(BaseModel):
    outsource_order_date: date
    outsource_return_date: date
    outsource_cost: Optional[float] = None
    note: Optional[str] = None

class OutsourceReturnIn(BaseModel):
    actual_return_date: Optional[date] = None
    note: Optional[str] = None

class OutsourceOperationOut(BaseModel):
    operation_id: int
    order_number: str
    product_name: str
    machine_name: str
    supplier_name: Optional[str]
    outsource_order_date: Optional[date]
    outsource_return_date: Optional[date]
    outsource_cost: Optional[float]
    outsource_status: Optional[str]

    class Config:
        from_attributes = True


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("/pending", response_model=List[OutsourceOperationOut])
def list_pending_outsource(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """外注依頼中工程一覧（返却予定日順）"""
    ops = (
        db.query(models.Operation)
        .join(models.Machine)
        .join(models.Order)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Machine.is_outsource == True,
            models.Operation.outsource_status.in_(["ordered", None]),
        )
        .order_by(models.Operation.outsource_return_date)
        .all()
    )
    return [
        OutsourceOperationOut(
            operation_id=op.id,
            order_number=op.order.order_number,
            product_name=op.order.product_name,
            machine_name=op.machine.name,
            supplier_name=op.machine.outsource_supplier,
            outsource_order_date=op.outsource_order_date,
            outsource_return_date=op.outsource_return_date,
            outsource_cost=op.outsource_cost,
            outsource_status=op.outsource_status,
        )
        for op in ops
    ]


@router.post("/orders/{order_id}/operations/{op_id}/outsource")
def register_outsource(
    order_id: int,
    op_id: int,
    payload: OutsourceOrderIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """外注依頼登録"""
    op = db.query(models.Operation).filter(
        models.Operation.id == op_id,
        models.Operation.order_id == order_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    op.outsource_order_date = payload.outsource_order_date
    op.outsource_return_date = payload.outsource_return_date
    op.outsource_cost = payload.outsource_cost
    op.outsource_status = "ordered"
    if payload.note:
        op.actual_note = payload.note
    db.commit()
    return {"message": "外注依頼を登録しました"}


@router.post("/orders/{order_id}/operations/{op_id}/outsource/return")
def register_return(
    order_id: int,
    op_id: int,
    payload: OutsourceReturnIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """返却登録"""
    op = db.query(models.Operation).filter(
        models.Operation.id == op_id,
        models.Operation.order_id == order_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    op.outsource_status = "returned"
    op.op_status = "done"
    db.commit()
    return {"message": "返却を登録しました"}
