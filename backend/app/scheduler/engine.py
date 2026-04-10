"""
スケジューリングエンジン — Phase 1
アルゴリズム：EDD（Earliest Due Date）ベースのフォワードスケジューリング

Phase 3でOR-Toolsによる数理最適化エンジンに差し替える予定。
このファイルがプロプランとスタンダードプランの差別化の核心。
"""

from datetime import datetime, timedelta, date
from typing import List, Dict, Optional, Tuple
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
    wait_hours_after: float = 0.0          # この工程完了後の待機時間（冷却・乾燥等）
    not_before: Optional[datetime] = None  # 開始不可日（材料入荷待ち等）
    schedule_locked: bool = False          # True=日時固定（再スケジュールで上書き禁止）
    locked_start: Optional[datetime] = None  # ロック時の固定開始日時
    locked_end: Optional[datetime] = None    # ロック時の固定終了日時


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
    non_working_days: List[date] = field(default_factory=list)  # 非稼働日（全休）
    reduced_hours_days: Dict[date, float] = field(default_factory=dict)  # 短縮稼働日: date -> hours
    batch_capacity: int = 1    # 同時処理可能数（炉・焼入れ等）
    is_outsource: bool = False              # 外注設備フラグ
    outsource_lead_days: int = 0           # 外注リードタイム（日）
    maintenance_windows: List[Tuple[datetime, datetime]] = field(default_factory=list)  # (開始, 終了)
    saturday_off: bool = False             # 土曜休みフラグ

    def _in_maintenance(self, dt: datetime) -> Optional[datetime]:
        """dt がメンテナンス中なら終了時刻を返す、そうでなければ None"""
        for mw_start, mw_end in self.maintenance_windows:
            if mw_start <= dt < mw_end:
                return mw_end
        return None

    def _next_maintenance_start(self, after: datetime, before: datetime) -> Optional[datetime]:
        """after〜before 内で最初に始まるメンテナンス開始時刻を返す"""
        result = None
        for mw_start, _ in self.maintenance_windows:
            if after < mw_start < before:
                result = mw_start if result is None else min(result, mw_start)
        return result

    def _is_off_day(self, d: date) -> bool:
        """非稼働日かどうか（祝日・日曜・土曜休み設定）"""
        if d in self.non_working_days:
            return True
        if d.weekday() == 6:  # 日曜
            return True
        if self.saturday_off and d.weekday() == 5:  # 土曜休み
            return True
        return False

    def _day_hours(self, d: date) -> float:
        """その日の稼働時間（短縮稼働日対応）"""
        return self.reduced_hours_days.get(d, self.daily_hours)

    def next_available(self, from_dt: datetime) -> datetime:
        """指定日時以降の最初の稼働開始時刻を返す"""
        if self.is_outsource:
            return from_dt  # 外注は常に受入可能（カレンダー時間で管理）
        dt = from_dt
        for _ in range(3650):  # 最大10年分、無限ループ防止
            # メンテナンス枠チェック
            mw_end = self._in_maintenance(dt)
            if mw_end is not None:
                dt = mw_end
                continue
            # 非稼働日チェック（祝日・日曜・土曜休み）
            if self._is_off_day(dt.date()):
                dt = (dt + timedelta(days=1)).replace(
                    hour=self.work_start_hour, minute=0, second=0, microsecond=0)
                continue
            # 稼働時間内かチェック（短縮稼働日対応）
            work_start = dt.replace(hour=self.work_start_hour, minute=0, second=0, microsecond=0)
            work_end = work_start + timedelta(hours=self._day_hours(dt.date()))
            if dt < work_start:
                dt = work_start
                continue  # work_start でメンテナンスが始まっている可能性があるので再チェック
            if dt >= work_end:
                dt = (dt + timedelta(days=1)).replace(
                    hour=self.work_start_hour, minute=0, second=0, microsecond=0)
                continue
            return dt
        return dt

    def add_hours(self, start: datetime, hours: float) -> datetime:
        """稼働時間を考慮して終了日時を計算（日またぎ・メンテナンス枠・短縮稼働日対応）"""
        if self.is_outsource:
            # 外注: hours = lead_days * 24 として渡されるためカレンダー時間で加算
            return start + timedelta(hours=hours)
        remaining = hours
        current = self.next_available(start)
        for _ in range(10000):  # 無限ループ防止
            if remaining <= 0:
                break
            work_start = current.replace(hour=self.work_start_hour, minute=0, second=0, microsecond=0)
            day_end = work_start + timedelta(hours=self._day_hours(current.date()))
            # メンテナンスが稼働時間内に割り込む場合は早めに切る
            mw_interrupt = self._next_maintenance_start(current, day_end)
            block_end = mw_interrupt if mw_interrupt else day_end
            available = (block_end - current).total_seconds() / 3600
            if remaining <= available:
                return current + timedelta(hours=remaining)
            remaining -= available
            if mw_interrupt:
                # メンテナンス終了後の次稼働開始へ
                mw_end = next((e for s, e in self.maintenance_windows if s == mw_interrupt), mw_interrupt)
                current = self.next_available(mw_end)
            else:
                # 今日の稼働時間を使い切った → 翌稼働日へ
                current = self.next_available(
                    (current + timedelta(days=1)).replace(
                        hour=self.work_start_hour, minute=0, second=0, microsecond=0)
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
        now = datetime.now().replace(second=0, microsecond=0)
        # バッチスロット管理: machine_id -> [slot0_free_at, slot1_free_at, ...]
        # batch_capacity 分のスロットを持ち、最も早く空くスロットに割り付ける
        self._machine_slots: Dict[int, List[datetime]] = {
            mid: [now] * max(1, cal.batch_capacity)
            for mid, cal in machine_calendars.items()
        }

    @property
    def machine_free_at(self) -> Dict[int, datetime]:
        """後方互換: 各設備の最早空き時刻を返す"""
        return {mid: min(slots) for mid, slots in self._machine_slots.items()}

    def _earliest_slot(self, mid: int) -> datetime:
        return min(self._machine_slots[mid])

    def _update_slot(self, mid: int, new_end: datetime) -> None:
        """最も早いスロットを new_end で更新する"""
        slots = self._machine_slots[mid]
        min_idx = min(range(len(slots)), key=lambda i: slots[i])
        slots[min_idx] = new_end

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

        # ── ① ロック済み工程を先に処理してスロットを占有させる ──
        for op in sorted_ops:
            if not op.schedule_locked or op.locked_start is None or op.locked_end is None:
                continue
            # ロック済み工程は固定日時をそのまま使用
            planned_start = op.locked_start
            planned_end = op.locked_end
            mid = op.machine_id
            # 設備スロットを更新（占有済みとして記録）
            if mid in self._machine_slots:
                self._update_slot(mid, planned_end)
            # 前工程終了時刻を更新
            prev_next = planned_end + timedelta(hours=op.wait_hours_after) if op.wait_hours_after > 0 else planned_end
            cur = order_prev_end.get(op.order_id)
            if cur is None or prev_next > cur:
                order_prev_end[op.order_id] = prev_next
            due_dt = datetime(op.due_date.year, op.due_date.month, op.due_date.day, 17, 0)
            is_delayed = planned_end > due_dt
            results.append(ScheduledOperation(
                order_id=op.order_id,
                order_number=op.order_number,
                product_name=op.product_name,
                machine_id=mid,
                sequence=op.sequence,
                planned_start=planned_start,
                planned_end=planned_end,
                duration_hours=op.duration_hours,
                due_date=op.due_date,
                is_delayed=is_delayed,
                delay_days=round(max(0, (planned_end - due_dt).total_seconds() / 86400), 1),
            ))

        # ── ② 通常工程（ロックなし）を処理 ──
        for op in sorted_ops:
            if op.schedule_locked:
                continue  # ロック済みは上で処理済み
            # 候補設備リストを決定（グループ指定がある場合はそちらを優先）
            candidates = op.allowed_machine_ids if op.allowed_machine_ids else [op.machine_id]
            candidates = [mid for mid in candidates if mid in self.calendars]
            if not candidates:
                continue

            prev_end = order_prev_end.get(op.order_id, datetime.now())
            # 材料調達待ち: not_before が設定されている場合は前工程終了より優先
            if op.not_before is not None:
                prev_end = max(prev_end, op.not_before)

            # 候補の中で最も早く終わる設備・スロットを選ぶ
            best_mid = candidates[0]
            best_start = best_end = None
            for mid in candidates:
                cal = self.calendars[mid]
                # バッチスロットの最早空き時刻と前工程の終了時刻の大きい方を開始候補に
                start_candidate = max(self._earliest_slot(mid), prev_end)
                ps = cal.next_available(start_candidate)
                pe = cal.add_hours(ps, op.duration_hours)
                if best_end is None or pe < best_end:
                    best_mid, best_start, best_end = mid, ps, pe

            planned_start = best_start
            planned_end = best_end

            # 選ばれた設備のスロットを更新（バッチ対応）
            self._update_slot(best_mid, planned_end)

            # 次工程の開始可能時刻：待機時間を経過時間として加算
            if op.wait_hours_after > 0:
                order_prev_end[op.order_id] = planned_end + timedelta(hours=op.wait_hours_after)
            else:
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
