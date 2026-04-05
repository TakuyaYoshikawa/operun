"""
品番テンプレート（簡易BOM）ルーター（Phase 3 Feature 13）
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

class TemplateOperationIn(BaseModel):
    sequence: int
    machine_id: int
    process_id: Optional[int] = None
    hours_per_unit: float

class TemplateOperationOut(BaseModel):
    id: int
    sequence: int
    machine_id: int
    machine_name: str
    process_id: Optional[int]
    process_name: Optional[str]
    hours_per_unit: float

    class Config:
        from_attributes = True

class ProductTemplateIn(BaseModel):
    product_code: str
    product_name: str
    note: Optional[str] = None
    operations: List[TemplateOperationIn] = []

class ProductTemplateOut(BaseModel):
    id: int
    product_code: str
    product_name: str
    note: Optional[str]
    operations: List[TemplateOperationOut]

    class Config:
        from_attributes = True

class ProductTemplateUpdate(BaseModel):
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    note: Optional[str] = None
    operations: Optional[List[TemplateOperationIn]] = None


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _to_op_out(op: models.TemplateOperation) -> TemplateOperationOut:
    return TemplateOperationOut(
        id=op.id,
        sequence=op.sequence,
        machine_id=op.machine_id,
        machine_name=op.machine.name if op.machine else "",
        process_id=op.process_id,
        process_name=op.process.name if op.process else None,
        hours_per_unit=op.hours_per_unit,
    )

def _to_out(t: models.ProductTemplate) -> ProductTemplateOut:
    return ProductTemplateOut(
        id=t.id,
        product_code=t.product_code,
        product_name=t.product_name,
        note=t.note,
        operations=[_to_op_out(op) for op in t.template_operations],
    )


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[ProductTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    templates = (
        db.query(models.ProductTemplate)
        .filter(models.ProductTemplate.tenant_id == tenant_id)
        .order_by(models.ProductTemplate.product_code)
        .all()
    )
    return [_to_out(t) for t in templates]


@router.post("", response_model=ProductTemplateOut, status_code=201)
def create_template(
    payload: ProductTemplateIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    # 品番重複チェック
    existing = db.query(models.ProductTemplate).filter(
        models.ProductTemplate.tenant_id == tenant_id,
        models.ProductTemplate.product_code == payload.product_code,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="この品番はすでに登録されています")

    template = models.ProductTemplate(
        tenant_id=tenant_id,
        product_code=payload.product_code,
        product_name=payload.product_name,
        note=payload.note,
    )
    db.add(template)
    db.flush()

    for op_in in payload.operations:
        op = models.TemplateOperation(
            template_id=template.id,
            sequence=op_in.sequence,
            machine_id=op_in.machine_id,
            process_id=op_in.process_id,
            hours_per_unit=op_in.hours_per_unit,
        )
        db.add(op)

    db.commit()
    db.refresh(template)
    return _to_out(template)


@router.get("/{code}", response_model=ProductTemplateOut)
def get_template_by_code(
    code: str,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    t = db.query(models.ProductTemplate).filter(
        models.ProductTemplate.tenant_id == tenant_id,
        models.ProductTemplate.product_code == code,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="テンプレートが見つかりません")
    return _to_out(t)


@router.put("/{id}", response_model=ProductTemplateOut)
def update_template(
    id: int,
    payload: ProductTemplateUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    t = db.query(models.ProductTemplate).filter(
        models.ProductTemplate.id == id,
        models.ProductTemplate.tenant_id == tenant_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="テンプレートが見つかりません")

    if payload.product_code is not None:
        t.product_code = payload.product_code
    if payload.product_name is not None:
        t.product_name = payload.product_name
    if payload.note is not None:
        t.note = payload.note

    if payload.operations is not None:
        # 既存工程を全削除して再登録
        for op in t.template_operations:
            db.delete(op)
        db.flush()
        for op_in in payload.operations:
            op = models.TemplateOperation(
                template_id=t.id,
                sequence=op_in.sequence,
                machine_id=op_in.machine_id,
                process_id=op_in.process_id,
                hours_per_unit=op_in.hours_per_unit,
            )
            db.add(op)

    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.delete("/{id}", status_code=204)
def delete_template(
    id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    t = db.query(models.ProductTemplate).filter(
        models.ProductTemplate.id == id,
        models.ProductTemplate.tenant_id == tenant_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="テンプレートが見つかりません")
    db.delete(t)
    db.commit()
