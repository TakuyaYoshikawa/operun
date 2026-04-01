from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app import models
from app.scheduler.engine import (
    SchedulingEngine, OperationInput, MachineCalendar
)

router = APIRouter()


def _build_engine(db: Session) -> SchedulingEngine:
    """DBから設備情報を読み込んでエンジンを初期化"""
    machines = db.query(models.Machine).filter(models.Machine.is_active == True).all()
    calendars = {
        m.id: MachineCalendar(
            machine_id=m.id,
            daily_hours=m.daily_capacity_hours,
        )
        for m in machines
    }
    return SchedulingEngine(calendars)


def _build_operation_inputs(db: Session) -> List[OperationInput]:
    """DBから全受注工程を読み込んでOperationInputリストを生成"""
    ops = (
        db.query(models.Operation)
        .join(models.Order)
        .filter(models.Order.status != "done")
        .order_by(models.Order.id, models.Operation.sequence)
        .all()
    )
    return [
        OperationInput(
            order_id=op.order.id,
            order_number=op.order.order_number,
            product_name=op.order.product_name,
            sequence=op.sequence,
            machine_id=op.machine_id,
            duration_hours=op.duration_hours,
            due_date=op.order.due_date,
            priority=op.order.priority,
            is_urgent=op.is_urgent,
        )
        for op in ops
    ]


@router.post("/run")
def run_schedule(db: Session = Depends(get_db)):
    """
    スケジューリングを実行してDBに計画日時を書き戻す。
    受注登録・変更のたびに呼び出す。
    """
    engine = _build_engine(db)
    op_inputs = _build_operation_inputs(db)

    if not op_inputs:
        return {"message": "スケジュールする受注がありません", "scheduled": 0}

    results = engine.schedule(op_inputs)

    # DBに計画日時を書き戻す
    for result in results:
        ops = (
            db.query(models.Operation)
            .filter(
                models.Operation.order_id == result.order_id,
                models.Operation.sequence == result.sequence,
                models.Operation.machine_id == result.machine_id,
            )
            .all()
        )
        for op in ops:
            op.planned_start = result.planned_start
            op.planned_end = result.planned_end

    db.commit()

    delayed = [r for r in results if r.is_delayed]
    return {
        "scheduled": len(results),
        "delayed_count": len(delayed),
        "delayed_orders": [
            {
                "order_number": r.order_number,
                "product_name": r.product_name,
                "planned_end": r.planned_end.isoformat(),
                "due_date": r.due_date.isoformat(),
                "delay_days": r.delay_days,
            }
            for r in delayed
        ],
    }


@router.get("/gantt")
def get_gantt_data(db: Session = Depends(get_db)):
    """
    ガントチャート表示用データを返す。
    Frappe Gantt / DHTMLX Gantt の形式に合わせて整形。
    """
    ops = (
        db.query(models.Operation)
        .join(models.Order)
        .join(models.Machine)
        .filter(models.Order.status != "done")
        .filter(models.Operation.planned_start != None)
        .all()
    )

    tasks = []
    for op in ops:
        due_dt = datetime(
            op.order.due_date.year,
            op.order.due_date.month,
            op.order.due_date.day,
            17, 0
        )
        is_delayed = op.planned_end and op.planned_end > due_dt

        tasks.append({
            "id": f"op-{op.id}",
            "text": f"{op.order.order_number} / {op.order.product_name}",
            "start_date": op.planned_start.strftime("%Y-%m-%d %H:%M") if op.planned_start else None,
            "end_date": op.planned_end.strftime("%Y-%m-%d %H:%M") if op.planned_end else None,
            "resource": op.machine.name,
            "machine_id": op.machine_id,
            "order_id": op.order_id,
            "due_date": op.order.due_date.isoformat(),
            "priority": op.order.priority,
            "is_urgent": op.is_urgent,
            "is_delayed": is_delayed,
            "color": "#e53e3e" if is_delayed else ("#f6ad55" if op.is_urgent else "#4aab68"),
        })

    return {"tasks": tasks, "total": len(tasks)}


@router.post("/simulate")
def simulate_new_order(payload: dict, db: Session = Depends(get_db)):
    """
    新規受注を差し込んだ場合の影響をシミュレーション。
    納期シミュレーション機能（Phase 2）で使用。
    """
    from datetime import date as date_type
    try:
        new_op = OperationInput(
            order_id=-1,
            order_number="(試算)",
            product_name=payload.get("product_name", "新規"),
            sequence=1,
            machine_id=payload["machine_id"],
            duration_hours=payload["duration_hours"],
            due_date=date_type.fromisoformat(payload["due_date"]),
            priority=payload.get("priority", 3),
            is_urgent=payload.get("is_urgent", False),
        )
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    engine = _build_engine(db)
    existing = _build_operation_inputs(db)
    result = engine.simulate_insert(new_op, existing)

    return result
