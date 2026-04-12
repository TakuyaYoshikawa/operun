from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id, require_admin


TRIAL_DAYS = 90


def get_trial_info(tenant: models.Tenant) -> dict:
    """テナントのトライアル情報を返す。"""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if tenant.trial_ends_at:
        ends_at = tenant.trial_ends_at
    else:
        ends_at = tenant.created_at + timedelta(days=TRIAL_DAYS) if tenant.created_at else now + timedelta(days=TRIAL_DAYS)
    days_remaining = (ends_at - now).days
    return {
        "trial_ends_at": ends_at.isoformat(),
        "days_remaining": max(days_remaining, 0),
        "is_expired": days_remaining < 0,
    }

router = APIRouter()


class SettingsOut(BaseModel):
    work_start_hour: int
    work_hours_per_day: float
    saturday_off: bool = False


class SettingsIn(BaseModel):
    work_start_hour: int
    work_hours_per_day: float
    saturday_off: bool = False


class TenantOut(BaseModel):
    tenant_name: str
    plan: str


class TenantIn(BaseModel):
    tenant_name: str


def _get_or_create(db: Session, tenant_id: int) -> models.TenantSettings:
    s = db.query(models.TenantSettings).filter(
        models.TenantSettings.tenant_id == tenant_id
    ).first()
    if not s:
        s = models.TenantSettings(tenant_id=tenant_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    s = _get_or_create(db, tenant_id)
    return SettingsOut(
        work_start_hour=s.work_start_hour,
        work_hours_per_day=s.work_hours_per_day,
        saturday_off=getattr(s, "saturday_off", False) or False,
    )


@router.put("", response_model=SettingsOut)
def update_settings(
    payload: SettingsIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    s = _get_or_create(db, tenant_id)
    s.work_start_hour = payload.work_start_hour
    s.work_hours_per_day = payload.work_hours_per_day
    s.saturday_off = payload.saturday_off
    db.commit()
    db.refresh(s)
    return SettingsOut(
        work_start_hour=s.work_start_hour,
        work_hours_per_day=s.work_hours_per_day,
        saturday_off=getattr(s, "saturday_off", False) or False,
    )


@router.get("/tenant", response_model=TenantOut)
def get_tenant(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    tenant = db.query(models.Tenant).filter(models.Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="テナントが見つかりません")
    return TenantOut(tenant_name=tenant.name, plan=tenant.plan)


@router.put("/tenant", response_model=TenantOut)
def update_tenant(
    payload: TenantIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    current_user: models.User = Depends(require_admin),
):
    tenant = db.query(models.Tenant).filter(models.Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="テナントが見つかりません")
    tenant.name = payload.tenant_name
    db.commit()
    db.refresh(tenant)
    return TenantOut(tenant_name=tenant.name, plan=tenant.plan)


class TrialOut(BaseModel):
    trial_ends_at: str
    days_remaining: int
    is_expired: bool


@router.get("/trial", response_model=TrialOut)
def get_trial(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    tenant = db.query(models.Tenant).filter(models.Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="テナントが見つかりません")
    return get_trial_info(tenant)
