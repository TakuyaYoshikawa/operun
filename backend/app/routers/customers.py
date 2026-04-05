from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── Pydantic スキーマ ──────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    code: str
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None


class CustomerOut(CustomerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerListOut(BaseModel):
    total: int
    items: List[CustomerOut]


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("", response_model=CustomerListOut)
def list_customers(
    q: Optional[str] = Query(None, description="顧客名の部分一致検索"),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    query = db.query(models.Customer).filter(models.Customer.tenant_id == tenant_id)
    if q:
        query = query.filter(models.Customer.name.contains(q))
    customers = query.order_by(models.Customer.code).all()
    return {"total": len(customers), "items": customers}


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    if db.query(models.Customer).filter(
        models.Customer.tenant_id == tenant_id,
        models.Customer.code == payload.code,
    ).first():
        raise HTTPException(status_code=409, detail="顧客コードが既に存在します")

    customer = models.Customer(**payload.model_dump(), tenant_id=tenant_id)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id,
        models.Customer.tenant_id == tenant_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    return customer


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id,
        models.Customer.tenant_id == tenant_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id,
        models.Customer.tenant_id == tenant_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    # 受注が紐づいている場合は削除不可
    in_use = db.query(models.Order).filter(
        models.Order.customer_id == customer_id,
        models.Order.tenant_id == tenant_id,
    ).first()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"顧客「{customer.name}」には受注が登録されているため削除できません。"
                   "先に関連する受注を削除してください。"
        )
    db.delete(customer)
    db.commit()


@router.get("/{customer_id}/orders")
def get_customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """顧客に紐づく受注一覧を返す。"""
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id,
        models.Customer.tenant_id == tenant_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    orders = db.query(models.Order).filter(
        models.Order.customer_id == customer_id,
        models.Order.tenant_id == tenant_id,
    ).order_by(models.Order.due_date).all()

    return {
        "customer": {"id": customer.id, "name": customer.name, "code": customer.code},
        "total": len(orders),
        "items": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "product_name": o.product_name,
                "quantity": o.quantity,
                "due_date": o.due_date.isoformat(),
                "status": o.status,
                "priority": o.priority,
            }
            for o in orders
        ],
    }
