from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


class SettingsOut(BaseModel):
    work_start_hour: int
    work_hours_per_day: float


class SettingsIn(BaseModel):
    work_start_hour: int
    work_hours_per_day: float


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
    return SettingsOut(work_start_hour=s.work_start_hour, work_hours_per_day=s.work_hours_per_day)


@router.put("", response_model=SettingsOut)
def update_settings(
    payload: SettingsIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    s = _get_or_create(db, tenant_id)
    s.work_start_hour = payload.work_start_hour
    s.work_hours_per_day = payload.work_hours_per_day
    db.commit()
    db.refresh(s)
    return SettingsOut(work_start_hour=s.work_start_hour, work_hours_per_day=s.work_hours_per_day)
