"""
CSVインポートエンドポイント（テナント対応）
- POST /api/csv/orders    — 受注CSVを一括インポート
- POST /api/csv/machines  — 設備マスタCSVを一括インポート
- POST /api/csv/processes — 工程マスタCSVを一括インポート

CSVフォーマット（受注）:
  order_number,product_name,product_code,quantity,due_date,priority,note
  ORD-001,部品A,ABC-001,50,2026-04-30,3,

CSVフォーマット（設備）:
  code,name,daily_capacity_hours,setup_time_minutes
  M01,旋盤1号機,8.0,30.0

CSVフォーマット（工程）:
  code,name,standard_time_per_unit
  P01,旋削,10.0
"""

import csv
import io
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


def _parse_csv(file_bytes: bytes) -> List[dict]:
    text = file_bytes.decode("utf-8-sig").strip()
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


@router.post("/orders", status_code=200)
async def import_orders_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """受注CSVを一括インポート（upsert）。テナント内での order_number で識別。"""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSVファイルをアップロードしてください")

    content = await file.read()
    try:
        rows = _parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSVパースエラー: {e}")

    created = 0
    updated = 0
    errors: List[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            order_number = row["order_number"].strip()
            product_name = row["product_name"].strip()
            product_code = row["product_code"].strip()
            quantity = int(row["quantity"])
            due_date = date.fromisoformat(row["due_date"].strip())

            if not order_number or not product_name or not product_code:
                raise ValueError("必須フィールドが空です")
            if quantity <= 0:
                raise ValueError("数量は1以上が必要です")

            priority = int(row.get("priority", "3") or "3")
            if priority not in (1, 2, 3):
                priority = 3

            existing = db.query(models.Order).filter(
                models.Order.tenant_id == tenant_id,
                models.Order.order_number == order_number,
            ).first()

            if existing:
                existing.product_name = product_name
                existing.product_code = product_code
                existing.quantity = quantity
                existing.due_date = due_date
                existing.priority = priority
                existing.status = (row.get("status") or "pending").strip()
                existing.note = (row.get("note") or "").strip() or None
                updated += 1
            else:
                db.add(models.Order(
                    tenant_id=tenant_id,
                    order_number=order_number,
                    product_name=product_name,
                    product_code=product_code,
                    quantity=quantity,
                    due_date=due_date,
                    priority=priority,
                    status=(row.get("status") or "pending").strip(),
                    note=(row.get("note") or "").strip() or None,
                ))
                created += 1

        except (KeyError, ValueError) as e:
            errors.append({"row": i, "error": str(e), "data": row})

    db.commit()
    return {"created": created, "updated": updated, "error_count": len(errors), "errors": errors}


@router.post("/machines", status_code=200)
async def import_machines_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """設備マスタCSVを一括インポート（upsert）。"""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSVファイルをアップロードしてください")

    content = await file.read()
    try:
        rows = _parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSVパースエラー: {e}")

    created = 0
    updated = 0
    errors: List[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            code = row["code"].strip()
            name = row["name"].strip()
            if not code or not name:
                raise ValueError("code・name は必須です")

            daily_hours = float(row.get("daily_capacity_hours") or "8.0")
            setup_minutes = float(row.get("setup_time_minutes") or "30.0")

            existing = db.query(models.Machine).filter(
                models.Machine.tenant_id == tenant_id,
                models.Machine.code == code,
            ).first()

            if existing:
                existing.name = name
                existing.daily_capacity_hours = daily_hours
                existing.setup_time_minutes = setup_minutes
                updated += 1
            else:
                db.add(models.Machine(
                    tenant_id=tenant_id,
                    code=code,
                    name=name,
                    daily_capacity_hours=daily_hours,
                    setup_time_minutes=setup_minutes,
                ))
                created += 1

        except (KeyError, ValueError) as e:
            errors.append({"row": i, "error": str(e), "data": row})

    db.commit()
    return {"created": created, "updated": updated, "error_count": len(errors), "errors": errors}


@router.post("/processes", status_code=200)
async def import_processes_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """工程マスタCSVを一括インポート（upsert）。"""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSVファイルをアップロードしてください")

    content = await file.read()
    try:
        rows = _parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSVパースエラー: {e}")

    created = 0
    updated = 0
    errors: List[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            code = row["code"].strip()
            name = row["name"].strip()
            std_time = float(row["standard_time_per_unit"])
            if not code or not name:
                raise ValueError("code・name は必須です")
            if std_time <= 0:
                raise ValueError("standard_time_per_unit は0より大きい値が必要です")

            existing = db.query(models.Process).filter(
                models.Process.tenant_id == tenant_id,
                models.Process.code == code,
            ).first()

            if existing:
                existing.name = name
                existing.standard_time_per_unit = std_time
                updated += 1
            else:
                db.add(models.Process(
                    tenant_id=tenant_id,
                    code=code,
                    name=name,
                    standard_time_per_unit=std_time,
                ))
                created += 1

        except (KeyError, ValueError) as e:
            errors.append({"row": i, "error": str(e), "data": row})

    db.commit()
    return {"created": created, "updated": updated, "error_count": len(errors), "errors": errors}
