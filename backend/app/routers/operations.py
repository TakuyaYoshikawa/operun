from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()


# ── Pydantic スキーマ ─────────────────────────────────────────────────────────

class OperationOut(BaseModel):
    id: int
    order_id: int
    order_number: str
    product_name: str
    customer_name: Optional[str]
    machine_id: int
    machine_name: str
    process_name: Optional[str]
    sequence: int
    duration_hours: float
    planned_start: Optional[datetime]
    planned_end: Optional[datetime]
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    actual_hours: Optional[float]
    op_status: str              # not_started / in_progress / done / on_hold
    worker: Optional[str]
    actual_note: Optional[str]
    is_urgent: bool
    due_date: date

    class Config:
        from_attributes = True


class StartIn(BaseModel):
    worker: Optional[str] = None


class CompleteIn(BaseModel):
    actual_hours: Optional[float] = None   # 省略時は actual_start からの経過時間
    actual_note: Optional[str] = None
    worker: Optional[str] = None


class HoldIn(BaseModel):
    actual_note: Optional[str] = None


class NoteIn(BaseModel):
    actual_note: Optional[str] = None
    worker: Optional[str] = None


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _op_query(db: Session, tenant_id: int):
    return (
        db.query(models.Operation)
        .options(
            joinedload(models.Operation.order).joinedload(models.Order.customer),
            joinedload(models.Operation.machine),
            joinedload(models.Operation.process),
        )
        .filter(models.Operation.tenant_id == tenant_id)
    )


def _to_out(op: models.Operation) -> dict:
    return {
        "id": op.id,
        "order_id": op.order_id,
        "order_number": op.order.order_number,
        "product_name": op.order.product_name,
        "customer_name": op.order.customer.name if op.order.customer else None,
        "machine_id": op.machine_id,
        "machine_name": op.machine.name,
        "process_name": op.process.name if op.process else None,
        "sequence": op.sequence,
        "duration_hours": op.duration_hours,
        "planned_start": op.planned_start,
        "planned_end": op.planned_end,
        "actual_start": op.actual_start,
        "actual_end": op.actual_end,
        "actual_hours": op.actual_hours,
        "op_status": op.op_status,
        "worker": op.worker,
        "actual_note": op.actual_note,
        "is_urgent": op.is_urgent,
        "due_date": op.order.due_date,
    }


def _add_log(db: Session, op: models.Operation, status: str, worker: str | None, note: str | None):
    log = models.OperationLog(
        tenant_id=op.tenant_id,
        operation_id=op.id,
        status=status,
        started_at=op.actual_start,
        finished_at=op.actual_end,
        actual_hours=op.actual_hours,
        worker=worker,
        note=note,
    )
    db.add(log)


# ── エンドポイント ────────────────────────────────────────────────────────────

@router.get("")
def list_operations(
    target_date: Optional[date] = None,
    machine_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> List[dict]:
    """工程一覧。target_date・machine_id・status でフィルタ可能。"""
    q = _op_query(db, tenant_id)

    if machine_id:
        q = q.filter(models.Operation.machine_id == machine_id)

    if status:
        q = q.filter(models.Operation.op_status == status)

    # 日付フィルタ：予定開始日 or 予定終了日がその日に含まれるもの
    if target_date:
        day_start = datetime(target_date.year, target_date.month, target_date.day, 0, 0)
        day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59)
        q = q.filter(
            (models.Operation.planned_start <= day_end) &
            (models.Operation.planned_end >= day_start)
        )

    ops = q.order_by(models.Operation.planned_start).all()
    return [_to_out(op) for op in ops]


@router.get("/today")
def today_operations(
    machine_id: Optional[int] = None,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> List[dict]:
    """直近稼働日の工程一覧（スマートフォン向け）。
    今日に工程がない場合（休日・週末など）は7日以内の次の稼働日を自動で探す。"""

    # 進行中の工程は常に含める
    q_inprog = _op_query(db, tenant_id).filter(
        models.Operation.op_status == "in_progress"
    )
    if machine_id:
        q_inprog = q_inprog.filter(models.Operation.machine_id == machine_id)
    inprog_ops = q_inprog.all()

    # 今日〜7日後で工程が存在する最初の日を探す
    target_date = None
    for delta in range(8):
        check = date.today() + timedelta(days=delta)
        ds = datetime(check.year, check.month, check.day, 0, 0)
        de = datetime(check.year, check.month, check.day, 23, 59, 59)
        q = _op_query(db, tenant_id).filter(
            models.Operation.op_status.in_(["not_started", "on_hold"]),
            models.Operation.planned_start <= de,
            models.Operation.planned_end >= ds,
        )
        if machine_id:
            q = q.filter(models.Operation.machine_id == machine_id)
        if q.count() > 0:
            target_date = check
            break

    day_ops: list = []
    if target_date:
        ds = datetime(target_date.year, target_date.month, target_date.day, 0, 0)
        de = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59)
        q = _op_query(db, tenant_id).filter(
            models.Operation.op_status != "done",
            models.Operation.planned_start <= de,
            models.Operation.planned_end >= ds,
        )
        if machine_id:
            q = q.filter(models.Operation.machine_id == machine_id)
        day_ops = q.all()

    # 重複排除してマージ
    seen = {op.id for op in day_ops}
    merged = day_ops + [op for op in inprog_ops if op.id not in seen]

    merged.sort(key=lambda op: (
        0 if op.op_status == "in_progress" else 1,
        op.planned_start or datetime.max,
    ))
    return [_to_out(op) for op in merged]


@router.get("/{operation_id}")
def get_operation(
    operation_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> dict:
    op = _op_query(db, tenant_id).filter(models.Operation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")
    return _to_out(op)


@router.post("/{operation_id}/start")
def start_operation(
    operation_id: int,
    body: StartIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> dict:
    """作業開始。op_status → in_progress"""
    op = _op_query(db, tenant_id).filter(models.Operation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")
    if op.op_status == "done":
        raise HTTPException(status_code=400, detail="すでに完了済みです")

    op.op_status = "in_progress"
    op.actual_start = datetime.now()
    if body.worker:
        op.worker = body.worker

    _add_log(db, op, "in_progress", body.worker, None)
    db.commit()
    return _to_out(op)


@router.post("/{operation_id}/complete")
def complete_operation(
    operation_id: int,
    body: CompleteIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> dict:
    """作業完了。op_status → done"""
    op = _op_query(db, tenant_id).filter(models.Operation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    now = datetime.now()
    op.op_status = "done"
    op.actual_end = now
    op.schedule_locked = True  # 完了工程は再スケジュールで変更しない

    if body.actual_hours is not None:
        op.actual_hours = body.actual_hours
    elif op.actual_start:
        elapsed = (now - op.actual_start).total_seconds() / 3600
        op.actual_hours = round(elapsed, 2)

    if body.actual_note:
        op.actual_note = body.actual_note
    if body.worker:
        op.worker = body.worker

    # 受注の全工程が完了したら受注ステータスを done に更新
    all_ops = db.query(models.Operation).filter(
        models.Operation.order_id == op.order_id
    ).all()
    if all(o.op_status == "done" for o in all_ops):
        order = db.query(models.Order).filter(models.Order.id == op.order_id).first()
        if order:
            order.status = "done"

    _add_log(db, op, "done", body.worker, body.actual_note)
    db.commit()
    return _to_out(op)


@router.post("/{operation_id}/hold")
def hold_operation(
    operation_id: int,
    body: HoldIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> dict:
    """作業中断。op_status → on_hold"""
    op = _op_query(db, tenant_id).filter(models.Operation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    op.op_status = "on_hold"
    if body.actual_note:
        op.actual_note = body.actual_note

    _add_log(db, op, "on_hold", op.worker, body.actual_note)
    db.commit()
    return _to_out(op)


@router.patch("/{operation_id}/note")
def update_note(
    operation_id: int,
    body: NoteIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
) -> dict:
    """作業者名・メモを更新。"""
    op = _op_query(db, tenant_id).filter(models.Operation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")

    if body.worker is not None:
        op.worker = body.worker
    if body.actual_note is not None:
        op.actual_note = body.actual_note

    db.commit()
    return _to_out(op)
