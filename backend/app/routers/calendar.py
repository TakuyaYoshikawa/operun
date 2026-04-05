from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── Pydantic スキーマ ──────────────────────────────────────────────────────────

class HolidayCreate(BaseModel):
    date: date
    holiday_name: Optional[str] = None
    working_hours: float = 0.0       # 0=全休 / 4=半日 / 8=通常稼働


class HolidayOut(BaseModel):
    id: int
    date: date
    holiday_name: Optional[str]
    working_hours: float

    class Config:
        from_attributes = True


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[HolidayOut])
def list_holidays(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """カレンダー休日一覧（年・月でフィルタ可）。"""
    q = db.query(models.CalendarHoliday).filter(
        models.CalendarHoliday.tenant_id == tenant_id
    )
    if year:
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        q = q.filter(
            models.CalendarHoliday.date >= start,
            models.CalendarHoliday.date <= end,
        )
    if month and year:
        # 月単位フィルタ
        import calendar as cal_mod
        last_day = cal_mod.monthrange(year, month)[1]
        q = q.filter(
            models.CalendarHoliday.date >= date(year, month, 1),
            models.CalendarHoliday.date <= date(year, month, last_day),
        )
    return q.order_by(models.CalendarHoliday.date).all()


@router.post("/holidays", response_model=HolidayOut, status_code=201)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """休日を登録する（同日に既存があれば上書き）。"""
    existing = db.query(models.CalendarHoliday).filter(
        models.CalendarHoliday.tenant_id == tenant_id,
        models.CalendarHoliday.date == payload.date,
    ).first()

    if existing:
        existing.holiday_name = payload.holiday_name
        existing.working_hours = payload.working_hours
        db.commit()
        db.refresh(existing)
        return existing

    holiday = models.CalendarHoliday(**payload.model_dump(), tenant_id=tenant_id)
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


@router.delete("/holidays/{holiday_date}", status_code=204)
def delete_holiday(
    holiday_date: date,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """指定日の休日設定を削除する。"""
    holiday = db.query(models.CalendarHoliday).filter(
        models.CalendarHoliday.tenant_id == tenant_id,
        models.CalendarHoliday.date == holiday_date,
    ).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="該当日の休日設定が見つかりません")
    db.delete(holiday)
    db.commit()


@router.post("/generate")
def generate_holidays(
    year: int = Query(..., description="祝日を自動生成する年"),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    指定年の日本の祝日を自動生成してDBに登録する。
    jpholiday ライブラリを使用。既存レコードはスキップ。
    """
    try:
        import jpholiday
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="jpholiday ライブラリがインストールされていません"
        )

    start = date(year, 1, 1)
    end = date(year, 12, 31)
    current = start
    created = 0

    while current <= end:
        holiday_name = jpholiday.is_holiday_name(current)
        if holiday_name:
            exists = db.query(models.CalendarHoliday).filter(
                models.CalendarHoliday.tenant_id == tenant_id,
                models.CalendarHoliday.date == current,
            ).first()
            if not exists:
                db.add(models.CalendarHoliday(
                    tenant_id=tenant_id,
                    date=current,
                    holiday_name=holiday_name,
                    working_hours=0.0,
                ))
                created += 1
        current += timedelta(days=1)

    db.commit()
    return {"year": year, "created": created, "message": f"{year}年の祝日を{created}件登録しました"}
