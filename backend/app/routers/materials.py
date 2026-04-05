"""
材料・在庫管理ルーター（Phase 3 Feature 15）
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── スキーマ ──────────────────────────────────────────────────────────────────

class MaterialIn(BaseModel):
    material_code: str
    material_name: str
    unit: str = "個"
    stock_quantity: float = 0.0
    reorder_point: float = 0.0
    unit_price: float = 0.0
    supplier_name: Optional[str] = None
    lead_days: int = 0
    note: Optional[str] = None

class MaterialOut(BaseModel):
    id: int
    material_code: str
    material_name: str
    unit: str
    stock_quantity: float
    reorder_point: float
    unit_price: float
    supplier_name: Optional[str]
    lead_days: int
    note: Optional[str]
    is_low_stock: bool  # 在庫が発注点以下

    class Config:
        from_attributes = True

class MaterialUpdate(BaseModel):
    material_code: Optional[str] = None
    material_name: Optional[str] = None
    unit: Optional[str] = None
    reorder_point: Optional[float] = None
    unit_price: Optional[float] = None
    supplier_name: Optional[str] = None
    lead_days: Optional[int] = None
    note: Optional[str] = None

class StockActionIn(BaseModel):
    quantity: float      # 正=入庫、負=出庫
    note: Optional[str] = None


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _to_out(m: models.Material) -> MaterialOut:
    return MaterialOut(
        id=m.id,
        material_code=m.material_code,
        material_name=m.material_name,
        unit=m.unit,
        stock_quantity=m.stock_quantity,
        reorder_point=m.reorder_point,
        unit_price=m.unit_price,
        supplier_name=m.supplier_name,
        lead_days=m.lead_days,
        note=m.note,
        is_low_stock=m.stock_quantity <= m.reorder_point,
    )


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[MaterialOut])
def list_materials(
    low_stock_only: bool = False,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    q = db.query(models.Material).filter(models.Material.tenant_id == tenant_id)
    materials = q.order_by(models.Material.material_code).all()
    result = [_to_out(m) for m in materials]
    if low_stock_only:
        result = [m for m in result if m.is_low_stock]
    return result


@router.post("", response_model=MaterialOut, status_code=201)
def create_material(
    payload: MaterialIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    existing = db.query(models.Material).filter(
        models.Material.tenant_id == tenant_id,
        models.Material.material_code == payload.material_code,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="この材料コードはすでに登録されています")

    m = models.Material(tenant_id=tenant_id, **payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return _to_out(m)


@router.put("/{id}", response_model=MaterialOut)
def update_material(
    id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    m = db.query(models.Material).filter(
        models.Material.id == id,
        models.Material.tenant_id == tenant_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="材料が見つかりません")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return _to_out(m)


@router.delete("/{id}", status_code=204)
def delete_material(
    id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    m = db.query(models.Material).filter(
        models.Material.id == id,
        models.Material.tenant_id == tenant_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="材料が見つかりません")
    db.delete(m)
    db.commit()


@router.post("/{id}/receive", response_model=MaterialOut)
def receive_stock(
    id: int,
    payload: StockActionIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """入庫登録"""
    m = db.query(models.Material).filter(
        models.Material.id == id,
        models.Material.tenant_id == tenant_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="材料が見つかりません")

    m.stock_quantity += abs(payload.quantity)
    log = models.MaterialStockLog(
        tenant_id=tenant_id,
        material_id=m.id,
        action="receive",
        quantity=abs(payload.quantity),
        note=payload.note,
    )
    db.add(log)
    db.commit()
    db.refresh(m)
    return _to_out(m)


@router.post("/{id}/issue", response_model=MaterialOut)
def issue_stock(
    id: int,
    payload: StockActionIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """払出登録"""
    m = db.query(models.Material).filter(
        models.Material.id == id,
        models.Material.tenant_id == tenant_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="材料が見つかりません")

    m.stock_quantity -= abs(payload.quantity)
    log = models.MaterialStockLog(
        tenant_id=tenant_id,
        material_id=m.id,
        action="issue",
        quantity=-abs(payload.quantity),
        note=payload.note,
    )
    db.add(log)
    db.commit()
    db.refresh(m)
    return _to_out(m)


@router.get("/alerts", response_model=List[MaterialOut])
def stock_alerts(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """発注点以下の材料一覧"""
    materials = db.query(models.Material).filter(
        models.Material.tenant_id == tenant_id,
    ).all()
    return [_to_out(m) for m in materials if m.stock_quantity <= m.reorder_point]
