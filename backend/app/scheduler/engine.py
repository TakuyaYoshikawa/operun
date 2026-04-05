"""
スケジューリングエンジン — Phase 1
アルゴリズム：EDD（Earliest Due Date）ベースのフォワードスケジューリング

Phase 3でOR-Toolsによる数理最適化エンジンに差し替える予定。
このファイルがプロプランとスタンダードプランの差別化の核心。
"""

from datetime import datetime, timedelta, date
from typing import List, Dict
from dataclasses import dataclass, field


@dataclass
class OperationInput:
    order_id: int
    order_number: str
    product_name: str
    sequence: int
    machine_id: int
    duration_hours: float
    due_date: date
    priority: int = 3                      # 1=特急, 2=高, 3=通常
    is_urgent: bool = False
    allowed_machine_ids: List[int] = field(default_factory=list)  # グループ内の候補設備IDリスト


@dataclass
class ScheduledOperation:
    order_id: int
    order_number: str
    product_name: str
    machine_id: int
    sequence: int
    planned_start: datetime
    planned_end: datetime
    duration_hours: float
    due_date: date
    is_delayed: bool = False   # 納期超過フラグ
    delay_days: float = 0.0


@dataclass
class MachineCalendar:
    """設備の稼働カレンダー"""
    machine_id: int
    daily_hours: float = 8.0
    work_start_hour: int = 8   # 稼働開始時刻
    non_working_days: List[date] = field(default_factory=list)  # 非稼働日

    def next_available(self, from_dt: datetime) -> datetime:
        """指定日時以降の最初の稼働開始時刻を返す"""
        dt = from_dt
        while True:
            if dt.date() in self.non_working_days:
                dt = datetime(dt.year, dt.month, dt.day + 1, self.work_start_hour, 0)
                continue
            if dt.weekday() == 6:  # 日曜
                dt = datetime(dt.year, dt.month, dt.day + 1, self.work_start_hour, 0)
                continue
            # 稼働時間内かチェック
            work_start = dt.replace(hour=self.work_start_hour, minute=0, second=0)
            work_end = work_start + timedelta(hours=self.daily_hours)
            if dt < work_start:
                return work_start
            if dt >= work_end:
                next_day = dt.date() + timedelta(days=1)
                dt = datetime(next_day.year, next_day.month, next_day.day,
                              self.work_start_hour, 0)
                continue
            return dt

    def add_hours(self, start: datetime, hours: float) -> datetime:
        """稼働時間を考慮して終了日時を計算（日をまたぐ場合も対応）"""
        remaining = hours
        current = self.next_available(start)
        while remaining > 0:
            day_end = current.replace(hour=self.work_start_hour, minute=0) \
                      + timedelta(hours=self.daily_hours)
            available_today = (day_end - current).total_seconds() / 3600
            if remaining <= available_today:
                return current + timedelta(hours=remaining)
            remaining -= available_today
            next_day = current.date() + timedelta(days=1)
            current = self.next_available(
                datetime(next_day.year, next_day.month, next_day.day,
                         self.work_start_hour, 0)
            )
        return current


class SchedulingEngine:
    """
    EDD（Earliest Due Date）フォワードスケジューラ
    - 納期が早い受注を優先して設備に割り付ける
    - 特急フラグがある受注は最優先
    - Phase 3でOR-Toolsによる最適化エンジンに差し替え予定
    """

    def __init__(self, machine_calendars: Dict[int, MachineCalendar]):
        self.calendars = machine_calendars
        # 設備ごとの「次に割り付け可能な時刻」を管理
        self.machine_free_at: Dict[int, datetime] = {
            mid: datetime.now().replace(second=0, microsecond=0)
            for mid in machine_calendars
        }

    def schedule(self, operations: List[OperationInput]) -> List[ScheduledOperation]:
        """
        受注工程リストを受け取り、スケジュール済み工程リストを返す。

        ソート順：
        1. 特急フラグ（True優先）
        2. 優先度（数字が小さいほど高優先）
        3. 納期（早い順）
        """
        sorted_ops = sorted(
            operations,
            key=lambda o: (
                not o.is_urgent,
                o.priority,
                o.due_date,
                o.order_id,
                o.sequence
            )
        )

        results: List[ScheduledOperation] = []
        # 受注ごとの前工程終了時刻（工程順序の依存関係を保証）
        order_prev_end: Dict[int, datetime] = {}

        for op in sorted_ops:
            # 候補設備リストを決定（グループ指定がある場合はそちらを優先）
            candidates = op.allowed_machine_ids if op.allowed_machine_ids else [op.machine_id]
            candidates = [mid for mid in candidates if mid in self.calendars]
            if not candidates:
                continue

            prev_end = order_prev_end.get(op.order_id, datetime.now())

            # 候補の中で最も早く終わる設備を選ぶ
            best_mid = candidates[0]
            best_start = best_end = None
            for mid in candidates:
                cal = self.calendars[mid]
                start_candidate = max(self.machine_free_at[mid], prev_end)
                ps = cal.next_available(start_candidate)
                pe = cal.add_hours(ps, op.duration_hours)
                if best_end is None or pe < best_end:
                    best_mid, best_start, best_end = mid, ps, pe

            cal = self.calendars[best_mid]
            planned_start = best_start
            planned_end = best_end

            # 設備の空き時刻を更新
            self.machine_free_at[best_mid] = planned_end
            order_prev_end[op.order_id] = planned_end

            # machine_id を選ばれた設備で上書き（グループ割り当ての結果）
            op.machine_id = best_mid

            # 納期チェック
            due_dt = datetime(op.due_date.year, op.due_date.month, op.due_date.day, 17, 0)
            is_delayed = planned_end > due_dt
            delay_days = max(0, (planned_end - due_dt).total_seconds() / 86400)

            results.append(ScheduledOperation(
                order_id=op.order_id,
                order_number=op.order_number,
                product_name=op.product_name,
                machine_id=best_mid,
                sequence=op.sequence,
                planned_start=planned_start,
                planned_end=planned_end,
                duration_hours=op.duration_hours,
                due_date=op.due_date,
                is_delayed=is_delayed,
                delay_days=round(delay_days, 1),
            ))

        return results

    def simulate_insert(
        self,
        new_op: OperationInput,
        existing_ops: List[OperationInput]
    ) -> Dict:
        """
        新規受注を差し込んだ場合の影響をシミュレーション。
        納期シミュレーション機能（Phase 2）で使用。
        """
        all_ops = existing_ops + [new_op]
        # エンジンをリセットして再計算
        engine = SchedulingEngine(self.calendars)
        new_schedule = engine.schedule(all_ops)

        new_result = next(
            (r for r in new_schedule if r.order_id == new_op.order_id), None
        )
        delayed = [r for r in new_schedule if r.is_delayed]

        return {
            "new_order_completion": new_result.planned_end if new_result else None,
            "new_order_delayed": new_result.is_delayed if new_result else None,
            "total_delayed_orders": len(delayed),
            "delayed_order_numbers": [r.order_number for r in delayed],
        }
