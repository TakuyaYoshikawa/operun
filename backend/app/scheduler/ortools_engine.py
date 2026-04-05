"""
OR-Toolsベースのスケジューリングエンジン（Phase 3 Feature 16）
CP-SATソルバーによるジョブショップスケジューリング最適化

目的関数：
  1. 納期超過ペナルティの最小化（最優先）
  2. 全工程の完了時刻合計の最小化（設備稼働率最大化に等価）
"""

from datetime import datetime, timedelta, date
from typing import List, Dict, Optional
from dataclasses import dataclass

from app.scheduler.engine import (
    OperationInput, ScheduledOperation, MachineCalendar, SchedulingEngine
)

try:
    from ortools.sat.python import cp_model
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False


# 時間の基本単位：15分 = 0.25時間
_SLOT = 0.25


def _to_slots(hours: float) -> int:
    return max(1, round(hours / _SLOT))


def _slots_to_dt(base: datetime, slots: int, calendar: MachineCalendar) -> datetime:
    """スロット数を実際の日時に変換（稼働カレンダー考慮）"""
    return calendar.add_hours(base, slots * _SLOT)


def _dt_to_slots(base: datetime, dt: datetime, calendar: MachineCalendar) -> int:
    """日時をスロット数に変換（稼働時間ベース）"""
    if dt <= base:
        return 0
    # 稼働時間を逆算するため、差分を日数単位で近似計算
    total_hours = 0.0
    current = calendar.next_available(base)
    target = dt

    while current.date() < target.date():
        day_end = current.replace(hour=calendar.work_start_hour) + timedelta(hours=calendar.daily_hours)
        available = (day_end - current).total_seconds() / 3600
        total_hours += available
        next_day = current.date() + timedelta(days=1)
        current = calendar.next_available(
            datetime(next_day.year, next_day.month, next_day.day, calendar.work_start_hour, 0)
        )

    if current <= target:
        total_hours += (target - current).total_seconds() / 3600

    return max(0, round(total_hours / _SLOT))


class ORToolsSchedulingEngine:
    """
    CP-SATソルバーを使ったジョブショップスケジューリング。
    解けない・時間超過の場合はEDDエンジンにフォールバック。
    """

    TIMEOUT_SEC = 20.0   # タイムアウト（秒）

    def __init__(self, machine_calendars: Dict[int, MachineCalendar]):
        self.calendars = machine_calendars

    def schedule(self, operations: List[OperationInput]) -> List[ScheduledOperation]:
        if not ORTOOLS_AVAILABLE or not operations:
            return SchedulingEngine(self.calendars).schedule(operations)

        # 工程が少ない場合はEDDで十分
        if len(operations) <= 3:
            return SchedulingEngine(self.calendars).schedule(operations)

        try:
            return self._solve(operations)
        except Exception:
            # 解けない場合はEDDにフォールバック
            return SchedulingEngine(self.calendars).schedule(operations)

    def _solve(self, operations: List[OperationInput]) -> List[ScheduledOperation]:
        base_dt = datetime.now().replace(second=0, microsecond=0, minute=0)
        # 計画期間：最大30日（稼働時間換算）
        horizon = 30 * 8 * 4   # スロット数

        model = cp_model.CpModel()

        # 変数定義
        task_vars = {}   # (order_id, seq) -> {start, end, interval}
        machine_intervals: Dict[int, list] = {mid: [] for mid in self.calendars}

        for op in operations:
            dur = _to_slots(op.duration_hours)
            key = (op.order_id, op.sequence)
            start = model.new_int_var(0, horizon - dur, f"s_{op.order_id}_{op.sequence}")
            end = model.new_int_var(dur, horizon, f"e_{op.order_id}_{op.sequence}")
            interval = model.new_interval_var(start, dur, end, f"i_{op.order_id}_{op.sequence}")
            task_vars[key] = {"start": start, "end": end, "interval": interval, "dur": dur, "op": op}
            if op.machine_id in machine_intervals:
                machine_intervals[op.machine_id].append(interval)

        # 制約1: 同じ設備は同時に1工程のみ
        for mid, intervals in machine_intervals.items():
            if intervals:
                model.add_no_overlap(intervals)

        # 制約2: 同一受注内の工程順序
        order_ops: Dict[int, List] = {}
        for op in operations:
            order_ops.setdefault(op.order_id, []).append(op)
        for order_id, ops_list in order_ops.items():
            sorted_ops = sorted(ops_list, key=lambda o: o.sequence)
            for i in range(len(sorted_ops) - 1):
                k1 = (order_id, sorted_ops[i].sequence)
                k2 = (order_id, sorted_ops[i + 1].sequence)
                if k1 in task_vars and k2 in task_vars:
                    model.add(task_vars[k2]["start"] >= task_vars[k1]["end"])

        # 目的関数: 納期超過ペナルティ + 完了時刻の合計最小化
        penalty_terms = []
        completion_terms = []

        for op in operations:
            key = (op.order_id, op.sequence)
            if key not in task_vars:
                continue
            end_var = task_vars[key]["end"]

            # 納期をスロット換算（最終工程のみペナルティを重く）
            due_dt = datetime(op.due_date.year, op.due_date.month, op.due_date.day, 17, 0)
            due_slots = _dt_to_slots(base_dt, due_dt, self.calendars.get(
                op.machine_id, MachineCalendar(machine_id=op.machine_id)))

            # 優先度・特急係数
            weight = 10 if op.is_urgent else (4 - op.priority)  # 特急=10, 高=3, 通常=2

            tardiness = model.new_int_var(0, horizon, f"tard_{op.order_id}_{op.sequence}")
            model.add_max_equality(tardiness, [end_var - due_slots, model.new_constant(0)])
            penalty_terms.append(weight * tardiness)
            completion_terms.append(end_var)

        # 目的関数 = 納期超過ペナルティ（重み100倍）+ 完了時刻合計
        objective_terms = [100 * t for t in penalty_terms] + completion_terms
        model.minimize(sum(objective_terms))

        # ソルバー実行
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.TIMEOUT_SEC
        solver.parameters.num_search_workers = 4
        status = solver.solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return SchedulingEngine(self.calendars).schedule(operations)

        # 結果をScheduledOperationに変換
        results: List[ScheduledOperation] = []
        for op in operations:
            key = (op.order_id, op.sequence)
            if key not in task_vars:
                continue
            cal = self.calendars.get(op.machine_id,
                                     MachineCalendar(machine_id=op.machine_id))
            start_slots = solver.value(task_vars[key]["start"])
            end_slots = solver.value(task_vars[key]["end"])

            planned_start = _slots_to_dt(base_dt, start_slots, cal)
            planned_end = _slots_to_dt(base_dt, end_slots, cal)

            due_dt = datetime(op.due_date.year, op.due_date.month, op.due_date.day, 17, 0)
            is_delayed = planned_end > due_dt
            delay_days = max(0.0, (planned_end - due_dt).total_seconds() / 86400)

            results.append(ScheduledOperation(
                order_id=op.order_id,
                order_number=op.order_number,
                product_name=op.product_name,
                machine_id=op.machine_id,
                sequence=op.sequence,
                planned_start=planned_start,
                planned_end=planned_end,
                duration_hours=op.duration_hours,
                due_date=op.due_date,
                is_delayed=is_delayed,
                delay_days=round(delay_days, 1),
            ))

        return results
