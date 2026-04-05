from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── 設備マスタ Pydantic スキーマ ───────────────────────────────────────────────

class MachineBase(BaseModel):
    name: str = Field(..., description="設備名（例：旋盤1号機）")
    code: str = Field(..., description="設備コード（テナント内で一意）")
    machine_type: Optional[str] = Field(None, description="設備グループ名（例：旋盤・マシニング）")
    daily_capacity_hours: float = Field(8.0, gt=0)
    setup_time_minutes: float = Field(30.0, ge=0)
    is_active: bool = True
    is_outsource: bool = False
    outsource_supplier: Optional[str] = None


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    name: Optional[str] = None
    machine_type: Optional[str] = None
    daily_capacity_hours: Optional[float] = Field(None, gt=0)
    setup_time_minutes: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None
    is_outsource: Optional[bool] = None
    outsource_supplier: Optional[str] = None


class MachineOut(MachineBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── 工程マスタ Pydantic スキーマ ───────────────────────────────────────────────

class ProcessBase(BaseModel):
    name: str
    code: str
    standard_time_per_unit: float = Field(..., gt=0)


class ProcessCreate(ProcessBase):
    pass


class ProcessUpdate(BaseModel):
    name: Optional[str] = None
    standard_time_per_unit: Optional[float] = Field(None, gt=0)


class ProcessOut(ProcessBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── 設備マスタ エンドポイント ──────────────────────────────────────────────────

@router.get("", response_model=List[MachineOut])
def list_machines(
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    q = db.query(models.Machine).filter(models.Machine.tenant_id == tenant_id)
    if is_active is not None:
        q = q.filter(models.Machine.is_active == is_active)
    return q.order_by(models.Machine.code).all()


@router.post("", response_model=MachineOut, status_code=201)
def create_machine(
    payload: MachineCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    # テナント内でのコード重複チェック
    if db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.code == payload.code,
    ).first():
        raise HTTPException(status_code=409, detail="設備コードが既に存在します")

    machine = models.Machine(**payload.model_dump(), tenant_id=tenant_id)
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return machine


@router.get("/{machine_id}", response_model=MachineOut)
def get_machine(
    machine_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    machine = db.query(models.Machine).filter(
        models.Machine.id == machine_id,
        models.Machine.tenant_id == tenant_id,
    ).first()
    if not machine:
        raise HTTPException(status_code=404, detail="設備が見つかりません")
    return machine


@router.put("/{machine_id}", response_model=MachineOut)
def update_machine(
    machine_id: int,
    payload: MachineUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    machine = db.query(models.Machine).filter(
        models.Machine.id == machine_id,
        models.Machine.tenant_id == tenant_id,
    ).first()
    if not machine:
        raise HTTPException(status_code=404, detail="設備が見つかりません")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(machine, key, value)
    db.commit()
    db.refresh(machine)
    return machine


@router.delete("/{machine_id}", status_code=204)
def delete_machine(
    machine_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    machine = db.query(models.Machine).filter(
        models.Machine.id == machine_id,
        models.Machine.tenant_id == tenant_id,
    ).first()
    if not machine:
        raise HTTPException(status_code=404, detail="設備が見つかりません")
    # 使用中チェック（工程実績・スケジュール）
    in_use = db.query(models.Operation).filter(
        models.Operation.machine_id == machine_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"設備「{machine.name}」は工程に使用されているため削除できません。"
                   "先に関連する受注・工程を削除するか、設備を「稼働停止」に変更してください。"
        )
    db.delete(machine)
    db.commit()


# ── 工程マスタ エンドポイント ──────────────────────────────────────────────────

@router.get("/processes/", response_model=List[ProcessOut])
def list_processes(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return db.query(models.Process).filter(
        models.Process.tenant_id == tenant_id
    ).order_by(models.Process.code).all()


@router.post("/processes/", response_model=ProcessOut, status_code=201)
def create_process(
    payload: ProcessCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    if db.query(models.Process).filter(
        models.Process.tenant_id == tenant_id,
        models.Process.code == payload.code,
    ).first():
        raise HTTPException(status_code=409, detail="工程コードが既に存在します")

    process = models.Process(**payload.model_dump(), tenant_id=tenant_id)
    db.add(process)
    db.commit()
    db.refresh(process)
    return process


@router.get("/processes/{process_id}", response_model=ProcessOut)
def get_process(
    process_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    process = db.query(models.Process).filter(
        models.Process.id == process_id,
        models.Process.tenant_id == tenant_id,
    ).first()
    if not process:
        raise HTTPException(status_code=404, detail="工程が見つかりません")
    return process


@router.put("/processes/{process_id}", response_model=ProcessOut)
def update_process(
    process_id: int,
    payload: ProcessUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    process = db.query(models.Process).filter(
        models.Process.id == process_id,
        models.Process.tenant_id == tenant_id,
    ).first()
    if not process:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(process, key, value)
    db.commit()
    db.refresh(process)
    return process


@router.delete("/processes/{process_id}", status_code=204)
def delete_process(
    process_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    process = db.query(models.Process).filter(
        models.Process.id == process_id,
        models.Process.tenant_id == tenant_id,
    ).first()
    if not process:
        raise HTTPException(status_code=404, detail="工程が見つかりません")
    # 使用中チェック
    in_use = db.query(models.Operation).filter(
        models.Operation.process_id == process_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"工程「{process.name}」は工程実績に使用されているため削除できません。"
        )
    db.delete(process)
    db.commit()
