from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id
from app.scheduler.engine import (
    SchedulingEngine, OperationInput, MachineCalendar
)
try:
    from app.scheduler.ortools_engine import ORToolsSchedulingEngine
    _ORTOOLS_AVAILABLE = True
except Exception:
    _ORTOOLS_AVAILABLE = False


class DraftEditIn(BaseModel):
    draft_start: datetime
    draft_end: datetime
    draft_machine_id: Optional[int] = None

router = APIRouter()


def _get_tenant_settings(db: Session, tenant_id: int):
    """テナント設定を取得（未設定ならデフォルト）"""
    s = db.query(models.TenantSettings).filter(
        models.TenantSettings.tenant_id == tenant_id
    ).first()
    if not s:
        return {"work_start_hour": 8, "work_hours_per_day": 8.0, "saturday_off": False}
    return {
        "work_start_hour": s.work_start_hour,
        "work_hours_per_day": s.work_hours_per_day,
        "saturday_off": getattr(s, "saturday_off", False) or False,
    }


def _build_calendars(db: Session, tenant_id: int) -> dict:
    """テナントの設備情報・カレンダー休日を読み込んでカレンダー辞書を生成"""
    tenant_cfg = _get_tenant_settings(db, tenant_id)

    machines = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.is_active == True,
    ).all()

    # 全休日・短縮稼働日を一括取得
    all_holidays = db.query(models.CalendarHoliday).filter(
        models.CalendarHoliday.tenant_id == tenant_id,
    ).all()
    non_working_dates = [h.date for h in all_holidays if h.working_hours == 0]
    reduced_hours_days = {
        h.date: h.working_hours
        for h in all_holidays
        if 0 < h.working_hours < (tenant_cfg["work_hours_per_day"] or 8.0)
    }

    # 設備ごとのメンテナンス枠を一括取得
    from datetime import timezone
    now_utc = datetime.now(tz=timezone.utc)
    maint_list = db.query(models.MachineMaintenance).filter(
        models.MachineMaintenance.tenant_id == tenant_id,
        models.MachineMaintenance.end_datetime >= now_utc,  # 過去のものは除外
    ).all()
    maint_map: dict[int, list] = {}
    for mw in maint_list:
        # PostgreSQLはタイムゾーン付きで返すため、naiveに統一する
        s = mw.start_datetime.replace(tzinfo=None) if mw.start_datetime.tzinfo else mw.start_datetime
        e = mw.end_datetime.replace(tzinfo=None) if mw.end_datetime.tzinfo else mw.end_datetime
        maint_map.setdefault(mw.machine_id, []).append((s, e))

    return {
        m.id: MachineCalendar(
            machine_id=m.id,
            daily_hours=m.daily_capacity_hours or tenant_cfg["work_hours_per_day"],
            # 設備個別のwork_start_hourが設定されていればそれを使用、なければテナント設定
            work_start_hour=m.work_start_hour if m.work_start_hour is not None else tenant_cfg["work_start_hour"],
            non_working_days=non_working_dates,
            reduced_hours_days=reduced_hours_days,
            batch_capacity=getattr(m, "batch_capacity", 1) or 1,
            is_outsource=m.is_outsource or False,
            outsource_lead_days=m.outsource_lead_days or 0,
            maintenance_windows=maint_map.get(m.id, []),
            saturday_off=tenant_cfg["saturday_off"],
        )
        for m in machines
    }


def _build_engine(db: Session, tenant_id: int, optimizer: str = "ortools") -> SchedulingEngine:
    """テナントの設備情報・カレンダー休日を読み込んでエンジンを初期化"""
    calendars = _build_calendars(db, tenant_id)
    if optimizer == "ortools" and _ORTOOLS_AVAILABLE:
        return ORToolsSchedulingEngine(calendars)
    return SchedulingEngine(calendars)


def _build_operation_inputs(db: Session, tenant_id: int) -> List[OperationInput]:
    """テナントの受注工程を読み込んでOperationInputリストを生成。
    machine_locked=False かつ同グループの設備が複数ある場合は allowed_machine_ids を設定する。"""

    # 通常設備（グループ自動選択・段取り時間用）
    regular_machines = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.is_active == True,
        models.Machine.is_outsource == False,
    ).all()
    # 設備グループマップ: machine_type -> [machine_id, ...]
    type_to_ids: dict[str, list[int]] = {}
    for m in regular_machines:
        if m.machine_type:
            type_to_ids.setdefault(m.machine_type, []).append(m.id)
    machine_type_map: dict[int, str] = {m.id: m.machine_type for m in regular_machines if m.machine_type}
    # 段取り時間（時間単位）
    setup_hours_map: dict[int, float] = {m.id: (m.setup_time_minutes or 0) / 60.0 for m in regular_machines}

    # 外注設備マップ
    outsource_machines = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.is_active == True,
        models.Machine.is_outsource == True,
    ).all()
    outsource_lead_days_map: dict[int, int] = {m.id: m.outsource_lead_days or 0 for m in outsource_machines}
    outsource_machine_ids: set[int] = {m.id for m in outsource_machines}

    ops = (
        db.query(models.Operation)
        .join(models.Order)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Order.status != "done",
        )
        .order_by(models.Order.id, models.Operation.sequence)
        .all()
    )

    result = []
    for op in ops:
        if op.machine_id in outsource_machine_ids:
            # 外注設備: リードタイム日数をカレンダー時間に変換、グループ自動選択なし
            lead_days = outsource_lead_days_map.get(op.machine_id, 0)
            total_hours = float(lead_days * 24)
            allowed: list[int] = []
        else:
            # グループ内の候補設備を決定
            allowed = []
            locked = getattr(op, "machine_locked", False)
            if not locked:
                mtype = machine_type_map.get(op.machine_id)
                if mtype and len(type_to_ids.get(mtype, [])) > 1:
                    allowed = type_to_ids[mtype]
            # 段取り時間を加算（実加工時間 + 段取り時間）
            setup_h = setup_hours_map.get(op.machine_id, 0.0)
            total_hours = op.duration_hours + setup_h

        # 材料調達待ち: not_before_date が設定されている場合は datetime に変換
        not_before_dt = None
        nb = getattr(op, "not_before_date", None)
        if nb:
            not_before_dt = datetime(nb.year, nb.month, nb.day, 0, 0, 0)

        schedule_locked = getattr(op, "schedule_locked", False) or False
        result.append(OperationInput(
            order_id=op.order.id,
            order_number=op.order.order_number,
            product_name=op.order.product_name,
            sequence=op.sequence,
            machine_id=op.machine_id,
            duration_hours=total_hours,
            due_date=op.order.due_date,
            priority=op.order.priority,
            is_urgent=op.is_urgent,
            allowed_machine_ids=[] if schedule_locked else allowed,  # ロック時は設備変更しない
            wait_hours_after=getattr(op, "wait_hours_after", 0.0) or 0.0,
            not_before=not_before_dt,
            schedule_locked=schedule_locked,
            locked_start=op.planned_start if schedule_locked else None,
            locked_end=op.planned_end if schedule_locked else None,
        ))
    return result


def _write_results_to_ops(db: Session, tenant_id: int, results, draft: bool):
    """スケジュール結果をDBに書き込む。draft=True なら下書きカラムへ。"""
    for result in results:
        ops = (
            db.query(models.Operation)
            .filter(
                models.Operation.tenant_id == tenant_id,
                models.Operation.order_id == result.order_id,
                models.Operation.sequence == result.sequence,
            )
            .all()
        )
        for op in ops:
            # schedule_locked=True の工程は日時・設備を上書きしない
            if getattr(op, "schedule_locked", False):
                continue
            if draft:
                op.draft_start      = result.planned_start
                op.draft_end        = result.planned_end
                op.draft_machine_id = result.machine_id if not getattr(op, "machine_locked", False) else op.machine_id
            else:
                op.planned_start = result.planned_start
                op.planned_end   = result.planned_end
                if not getattr(op, "machine_locked", False):
                    op.machine_id = result.machine_id
    db.commit()


@router.post("/run")
def run_schedule(
    optimizer: str = "ortools",
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """スケジューリングを実行して下書きカラムに保存する（現行スケジュールは変更しない）。"""
    engine = _build_engine(db, tenant_id, optimizer)
    op_inputs = _build_operation_inputs(db, tenant_id)

    if not op_inputs:
        return {"message": "スケジュールする受注がありません", "scheduled": 0, "draft": True}

    results = engine.schedule(op_inputs)
    _write_results_to_ops(db, tenant_id, results, draft=True)

    delayed = [r for r in results if r.is_delayed]
    return {
        "scheduled": len(results),
        "delayed_count": len(delayed),
        "draft": True,
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


@router.post("/commit")
def commit_draft(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """下書きスケジュールを現行スケジュールに確定する。"""
    ops = (
        db.query(models.Operation)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.draft_start != None,
        )
        .all()
    )
    if not ops:
        raise HTTPException(status_code=404, detail="確定する下書きがありません")

    for op in ops:
        op.planned_start = op.draft_start
        op.planned_end   = op.draft_end
        if op.draft_machine_id and not getattr(op, "machine_locked", False):
            op.machine_id = op.draft_machine_id
        op.draft_start      = None
        op.draft_end        = None
        op.draft_machine_id = None

    db.commit()
    return {"committed": len(ops)}


@router.post("/discard")
def discard_draft(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """下書きスケジュールを破棄する。"""
    ops = (
        db.query(models.Operation)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.draft_start != None,
        )
        .all()
    )
    for op in ops:
        op.draft_start      = None
        op.draft_end        = None
        op.draft_machine_id = None
    db.commit()
    return {"discarded": len(ops)}


@router.get("/gantt")
def get_gantt_data(
    draft: bool = False,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """ガントチャート表示用データを返す。draft=true で下書きを表示。"""
    # 下書きモードでは draft_start があるものだけ対象
    q = (
        db.query(models.Operation)
        .join(models.Order)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Order.status != "done",
        )
    )
    if draft:
        q = q.filter(models.Operation.draft_start != None)
    else:
        q = q.filter(models.Operation.planned_start != None)

    ops = q.all()

    # 下書きモードでは設備が変わっている可能性があるため machine を別途取得
    machine_map = {
        m.id: m for m in db.query(models.Machine).filter(
            models.Machine.tenant_id == tenant_id
        ).all()
    }

    # 下書きに含まれていない工程も現行として並べて比較できるよう has_draft を付与
    has_draft = any(op.draft_start is not None for op in (
        db.query(models.Operation).filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.draft_start != None,
        ).limit(1).all()
    ))

    tasks = []
    for op in ops:
        if draft:
            start  = op.draft_start
            end    = op.draft_end
            mid    = op.draft_machine_id or op.machine_id
        else:
            start  = op.planned_start
            end    = op.planned_end
            mid    = op.machine_id

        machine = machine_map.get(mid)
        if not machine or not start or not end:
            continue

        due_dt = datetime(op.order.due_date.year, op.order.due_date.month, op.order.due_date.day, 17, 0)
        is_delayed = end > due_dt

        tasks.append({
            "id": f"op-{op.id}",
            "text": f"{op.order.order_number} / {op.order.product_name}",
            "start_date": start.strftime("%Y-%m-%d %H:%M"),
            "end_date":   end.strftime("%Y-%m-%d %H:%M"),
            "resource": machine.name,
            "machine_id": mid,
            "order_id": op.order_id,
            "due_date": op.order.due_date.isoformat(),
            "priority": op.order.priority,
            "is_urgent": op.is_urgent,
            "is_delayed": is_delayed,
            "is_locked": getattr(op, "schedule_locked", False) or False,
            "op_status": op.op_status or "not_started",
            "sequence": op.sequence,
            "color": "#e53e3e" if is_delayed else ("#f6ad55" if op.is_urgent else "#4aab68"),
        })

    return {"tasks": tasks, "total": len(tasks), "has_draft": has_draft}


@router.post("/create-draft")
def create_draft_from_current(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """現行スケジュール（planned_start/end）をそのまま下書きカラムにコピーする。"""
    ops = (
        db.query(models.Operation)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.planned_start != None,
        )
        .all()
    )
    if not ops:
        raise HTTPException(status_code=404, detail="コピー元のスケジュールがありません")

    for op in ops:
        op.draft_start      = op.planned_start
        op.draft_end        = op.planned_end
        op.draft_machine_id = op.machine_id
    db.commit()
    return {"created": len(ops)}


@router.patch("/draft/{operation_id}")
def update_draft_operation(
    operation_id: int,
    payload: DraftEditIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """下書き内の特定工程の日時・設備を更新する。"""
    op = db.query(models.Operation).filter(
        models.Operation.id == operation_id,
        models.Operation.tenant_id == tenant_id,
        models.Operation.draft_start != None,
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="下書き工程が見つかりません")

    op.draft_start      = payload.draft_start
    op.draft_end        = payload.draft_end
    if payload.draft_machine_id is not None:
        op.draft_machine_id = payload.draft_machine_id
    db.commit()
    return {"ok": True}


@router.post("/simulate")
def simulate_new_order(
    payload: dict,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        new_op = OperationInput(
            order_id=-1,
            order_number="(試算)",
            product_name=payload.get("product_name", "新規"),
            sequence=1,
            machine_id=payload["machine_id"],
            duration_hours=payload["duration_hours"],
            due_date=date.fromisoformat(payload["due_date"]),
            priority=payload.get("priority", 3),
            is_urgent=payload.get("is_urgent", False),
        )
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    engine = _build_engine(db, tenant_id)
    existing = _build_operation_inputs(db, tenant_id)
    return engine.simulate_insert(new_op, existing)


def _calc_business_days(start: datetime, end: datetime) -> int:
    if end is None or start is None:
        return 0
    count = 0
    current = start.date()
    end_date = end.date()
    while current <= end_date:
        if current.weekday() != 6:
            count += 1
        current = current.replace(day=current.day + 1) if current.day < 28 else \
            (current.replace(month=current.month + 1, day=1) if current.month < 12 else
             current.replace(year=current.year + 1, month=1, day=1))
    return max(count - 1, 0)


def _format_date_ja(dt: datetime) -> str:
    WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"]
    w = WEEKDAYS[dt.weekday()]
    return f"{dt.year}年{dt.month}月{dt.day}日（{w}）"


@router.post("/simulate/delivery")
def check_delivery_date(
    payload: dict,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """F-05 納期回答支援。"""
    try:
        new_op = OperationInput(
            order_id=-1,
            order_number="(試算)",
            product_name=payload.get("product_name", "新規"),
            sequence=1,
            machine_id=payload["machine_id"],
            duration_hours=payload["duration_hours"],
            due_date=date.fromisoformat(payload["due_date"]),
            priority=payload.get("priority", 3),
            is_urgent=payload.get("is_urgent", False),
        )
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    engine = _build_engine(db, tenant_id)
    existing = _build_operation_inputs(db, tenant_id)
    result = engine.simulate_insert(new_op, existing)

    completion: datetime | None = result["new_order_completion"]
    feasible = completion is not None

    return {
        "feasible": feasible,
        "completion_date": _format_date_ja(completion) if completion else None,
        "completion_datetime": completion.isoformat() if completion else None,
        "business_days": _calc_business_days(datetime.now(), completion) if completion else None,
        "on_time": result.get("new_order_delayed") is False if feasible else None,
        "affected_orders": result["delayed_order_numbers"],
        "affected_count": result["total_delayed_orders"],
    }


@router.get("/load")
def get_load_chart(
    days: int = 21,
    draft: bool = False,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """設備別・日次負荷グラフデータを返す。"""
    from datetime import date as date_type
    calendars = _build_calendars(db, tenant_id)

    # スケジュール済み工程を取得
    q = (
        db.query(models.Operation)
        .join(models.Order)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Order.status != "done",
        )
    )
    if draft:
        q = q.filter(models.Operation.draft_start != None)
        ops = [(op.draft_machine_id or op.machine_id, op.draft_start, op.draft_end) for op in q.all()]
    else:
        q = q.filter(models.Operation.planned_start != None)
        ops = [(op.machine_id, op.planned_start, op.planned_end) for op in q.all()]

    if not ops:
        return {"machines": [], "date_range": {"start": None, "end": None}}

    # 対象日付範囲
    today = date_type.today()
    date_range = [today + timedelta(days=i) for i in range(days)]

    # 設備情報
    machines = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.is_active == True,
    ).all()
    machine_map = {m.id: m for m in machines}

    # 設備×日付 ごとの負荷時間を集計
    load: dict[int, dict[date_type, float]] = {m.id: {} for m in machines}
    for mid, start, end in ops:
        if not start or not end or mid not in load:
            continue
        # 工程が各日に何時間かかるかを分割
        cur = start
        while cur < end:
            d = cur.date()
            if d in {d2 for d2 in date_range}:
                next_day = datetime(d.year, d.month, d.day) + timedelta(days=1)
                day_end = min(end, next_day)
                h = (day_end - cur).total_seconds() / 3600
                load[mid][d] = load[mid].get(d, 0.0) + h
            cur = datetime(cur.year, cur.month, cur.day) + timedelta(days=1)
            cur = cur.replace(hour=0, minute=0, second=0, microsecond=0)

    result = []
    for m in machines:
        cal = calendars.get(m.id)
        days_data = []
        for d in date_range:
            if cal and cal._is_off_day(d):
                capacity = 0.0
            elif cal:
                capacity = cal._day_hours(d)
            else:
                capacity = m.daily_capacity_hours or 8.0
            load_h = round(load[m.id].get(d, 0.0), 2)
            utilization = round(load_h / capacity, 3) if capacity > 0 else 0.0
            days_data.append({
                "date": d.isoformat(),
                "load_hours": load_h,
                "capacity_hours": capacity,
                "utilization": min(utilization, 1.0),  # 100%上限
                "over_capacity": load_h > capacity,
            })
        result.append({
            "machine_id": m.id,
            "name": m.name,
            "code": m.code,
            "is_outsource": m.is_outsource or False,
            "days": days_data,
        })

    return {
        "machines": result,
        "date_range": {
            "start": date_range[0].isoformat(),
            "end": date_range[-1].isoformat(),
        },
    }


@router.post("/operations/{operation_id}/lock")
def toggle_lock(
    operation_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """工程のスケジュールロックをトグルする。ロック済み→解除、未ロック→ロック。"""
    op = db.query(models.Operation).filter(
        models.Operation.id == operation_id,
        models.Operation.tenant_id == tenant_id,
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail="工程が見つかりません")
    if not op.planned_start:
        raise HTTPException(status_code=400, detail="スケジュール済みの工程のみロックできます")

    op.schedule_locked = not (getattr(op, "schedule_locked", False) or False)
    db.commit()
    return {"operation_id": operation_id, "schedule_locked": op.schedule_locked}
