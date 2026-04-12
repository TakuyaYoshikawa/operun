"""
AI自然言語入力ルーター（Phase 2 Feature 12）
使用モデル：claude-haiku-4-5（低コスト・高速）
"""

import os
import json
import calendar as cal_mod
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import anthropic

from app.database import get_db
from app import models
from app.auth import get_current_tenant_id

router = APIRouter()

HAIKU_MODEL  = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"

def _get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY が設定されていません")
    return anthropic.Anthropic(api_key=api_key)


# ── スキーマ ──────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[str] = None   # ガントデータなど追加コンテキスト

class ParseOrderRequest(BaseModel):
    text: str                       # ユーザーの入力テキスト（単発）

class ExplainSimulationRequest(BaseModel):
    result: dict                    # /api/schedule/simulate/delivery のレスポンス


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("/constraints")
def get_constraints_summary(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    現在有効な制約設定のサマリーを返す。
    制約設定確認画面で使用する。
    """
    from datetime import datetime as dt
    now = dt.now()
    today = date.today()
    future = today + timedelta(days=90)

    # 稼働中設備・グループ
    active_machines = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.is_active == True,
    ).order_by(models.Machine.name).all()

    # 停止中設備
    inactive_machines = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
        models.Machine.is_active == False,
    ).order_by(models.Machine.name).all()

    # 設備グループ（machine_type が同じもの）
    groups: dict[str, list[str]] = {}
    for m in active_machines:
        if m.machine_type:
            groups.setdefault(m.machine_type, []).append(m.name)

    # メンテナンス枠（未来）
    maint_list = db.query(models.MachineMaintenance).filter(
        models.MachineMaintenance.tenant_id == tenant_id,
        models.MachineMaintenance.end_datetime >= now,
    ).order_by(models.MachineMaintenance.start_datetime).all()
    machine_name_map = {m.id: m.name for m in db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant_id,
    ).all()}

    # カレンダー例外（今後3ヶ月）
    holidays = db.query(models.CalendarHoliday).filter(
        models.CalendarHoliday.tenant_id == tenant_id,
        models.CalendarHoliday.date >= today,
        models.CalendarHoliday.date <= future,
    ).order_by(models.CalendarHoliday.date).all()

    # ロック済み工程
    locked_ops = db.query(models.Operation).filter(
        models.Operation.tenant_id == tenant_id,
        models.Operation.schedule_locked == True,
    ).all()

    # 設備固定工程
    machine_locked_ops = db.query(models.Operation).filter(
        models.Operation.tenant_id == tenant_id,
        models.Operation.machine_locked == True,
    ).all()

    return {
        "machine_groups": [
            {"type": k, "machines": v}
            for k, v in groups.items()
        ],
        "active_machine_count": len(active_machines),
        "inactive_machines": [
            {"id": m.id, "name": m.name, "type": m.machine_type}
            for m in inactive_machines
        ],
        "upcoming_maintenance": [
            {
                "machine_id": mw.machine_id,
                "machine": machine_name_map.get(mw.machine_id, f"ID:{mw.machine_id}"),
                "start": mw.start_datetime.strftime("%Y/%m/%d %H:%M"),
                "end": mw.end_datetime.strftime("%Y/%m/%d %H:%M"),
                "reason": mw.reason,
            }
            for mw in maint_list
        ],
        "calendar_exceptions": [
            {
                "date": str(h.date),
                "working_hours": h.working_hours,
                "name": h.holiday_name,
                "type": "全休" if h.working_hours == 0 else f"短縮稼働 {h.working_hours}h",
            }
            for h in holidays
        ],
        "locked_operations": [
            {
                "id": op.id,
                "order_number": op.order.order_number if op.order else "?",
                "sequence": op.sequence,
                "planned_start": op.planned_start.strftime("%Y/%m/%d %H:%M") if op.planned_start else None,
                "planned_end": op.planned_end.strftime("%Y/%m/%d %H:%M") if op.planned_end else None,
            }
            for op in locked_ops
        ],
        "locked_operations_count": len(locked_ops),
        "machine_locked_count": len(machine_locked_ops),
    }


@router.post("/chat")
def ai_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    汎用AIチャット。
    ガントデータ等をコンテキストとして渡し、状況確認質問に日本語で回答する。
    """
    client = _get_client()

    system_prompt = """あなたは金属加工・部品加工工場の生産スケジューラ「Operun」のAIアシスタントです。
現場担当者や営業担当者の質問に、簡潔・丁寧な日本語で答えてください。
数字は具体的に、日付は「4月30日（水）」形式で答えてください。"""

    if req.context:
        system_prompt += f"\n\n## 現在のスケジュール情報\n{req.context}"

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )

    return {"reply": response.content[0].text}


@router.post("/parse-order")
def parse_order(
    req: ParseOrderRequest,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    自然言語テキストを受注フォームデータに変換する。
    分かる範囲で全フィールドを埋め、不明なものは null を返す。
    """
    client = _get_client()

    customers = db.query(models.Customer).filter(
        models.Customer.tenant_id == tenant_id
    ).all()
    customer_list = "\n".join([f"- {c.name}（id={c.id}）" for c in customers])

    today = date.today()
    # 来月末の計算
    if today.month == 12:
        next_month_end = date(today.year + 1, 1, 31)
    else:
        last_day = cal_mod.monthrange(today.year, today.month + 1)[1]
        next_month_end = date(today.year, today.month + 1, last_day)
    this_month_end = date(today.year, today.month,
                          cal_mod.monthrange(today.year, today.month)[1])

    prompt = f"""以下のテキストから受注情報を抽出してください。

入力テキスト：「{req.text}」

今日の日付：{today.isoformat()}
今月末：{this_month_end.isoformat()}
来月末：{next_month_end.isoformat()}

登録済み顧客（顧客名が含まれていたらcustomer_idをセット）：
{customer_list or "（なし）"}

## 抽出ルール
- 1件の受注のみ含まれる場合は単一オブジェクトを返す
- 複数の受注が含まれる場合は配列で返す
- 優先度：「特急」「至急」「緊急」→1、「急ぎ」「高」「早め」→2、それ以外→3
- 日付：「来月末」→{next_month_end.isoformat()}、「今月中」「今月末」→{this_month_end.isoformat()}
- 品番：英数字コードがあれば設定、なければ null
- missing_fields：null になったフィールド名のリスト

## レスポンス形式（JSONのみ。説明文不要）
単一の場合：
{{"product_name":"品名","product_code":null,"quantity":50,"due_date":"2026-04-30","priority":2,"customer_id":1,"note":null,"missing_fields":[]}}

複数の場合：
[{{"product_name":"品名A",...}},{{"product_name":"品名B",...}}]"""

    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    try:
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
    except json.JSONDecodeError:
        parsed = {
            "product_name": None, "product_code": None, "quantity": None,
            "due_date": None, "priority": 3, "customer_id": None, "note": None,
            "missing_fields": ["product_name", "quantity", "due_date"],
        }

    # 配列・単体どちらでも統一レスポンスで返す
    if isinstance(parsed, list):
        return {"type": "multiple", "orders": parsed}
    return {"type": "single", "order": parsed}


@router.post("/explain-simulation")
def explain_simulation(
    req: ExplainSimulationRequest,
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    納期シミュレーション結果を営業担当が電話口で読み上げられる日本語文章に変換する。
    """
    client = _get_client()

    result = req.result
    feasible = result.get("feasible", False)
    completion_date = result.get("completion_date", "不明")
    business_days = result.get("business_days", 0)
    on_time = result.get("on_time", False)
    affected_orders = result.get("affected_orders", [])
    affected_count = result.get("affected_count", 0)

    prompt = f"""以下の納期シミュレーション結果を、営業担当者が顧客への電話口でそのまま読み上げられる自然な日本語に変換してください。
丁寧な敬語で、2〜4文程度にまとめてください。

## シミュレーション結果
- 受注可否: {"受注可能" if feasible else "受注困難"}
- 完成予定日: {completion_date}
- 今日から完成まで: {business_days} 営業日
- 納期内完成: {"はい" if on_time else "いいえ（納期超過）"}
- 影響を受ける既存受注: {affected_count} 件 {("（" + "、".join(affected_orders[:3]) + ("等" if len(affected_orders) > 3 else "") + "）") if affected_orders else ""}

日本語文章のみを返し、それ以外は含めないこと。"""

    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )

    return {"message": response.content[0].text.strip()}


@router.post("/agent")
def ai_agent(
    req: ChatRequest,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    AIエージェントモード（Phase 5 Feature 21）
    Claude Tool Use で既存APIを自然言語から呼び出す。
    """
    client = _get_client()

    tools = _build_agent_tools()
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    system_prompt = """あなたはOperunのAIエージェントです。金属加工工場の生産管理システムを自然言語で操作できます。
利用可能なツールを積極的に使ってユーザーの指示を実行してください。

## 利用可能な操作
### 受注・在庫管理
- 受注の検索・情報確認（search_orders）
- 受注の納期・優先度・数量・ステータス・備考の変更（update_order）
- 新規受注の登録（create_order）
- 材料在庫の確認・入出庫（search_materials, receive_stock, issue_stock）
- 発注登録（create_purchase_order）
- スケジュール状況確認（get_schedule_summary）
- スケジュール再実行（run_schedule）

### スケジューリング制約設定
- 設備の検索（search_machines）
- 設備の稼働状態変更（update_machine_status）
- 設備の稼働能力変更（update_machine_capacity）— 1日稼働時間・段取り時間・バッチ数・開始時刻
- メンテナンス枠の登録（add_maintenance_window）
- 工程制約の変更（update_operation_constraint）— 設備固定・待機時間・開始不可日・スケジュールロック・特急フラグ
- カレンダー例外日の追加（add_calendar_exception）
- 工場全体設定の変更（update_tenant_settings）— 稼働開始時刻・1日稼働時間・土曜休日
- 現在の制約設定を説明（explain_constraints）

## 操作ルール
1. **読み取り操作**（search_orders, search_machines, explain_constraints等）は即座に実行してよい
2. **書き込み操作**は実行前に変更内容とその影響をユーザーに提示して確認を取る
   - 確認例：「旋盤1号機を4/14〜4/18の間メンテナンス不可にします。影響受注数：X件。よろしいですか？」
   - ユーザーが「はい」「お願い」「実行して」等と返答したら実行する
3. 変更完了後は変更内容を明示し、スケジュール再実行を提案する
4. 設備名が不明な場合はまず search_machines で検索する
5. 受注番号が不明な場合はまず search_orders で検索する
6. 制約変更後は explain_constraints でサマリーを表示する
7. 日本語で簡潔に回答する"""

    tool_calls_log: list = []
    MAX_ITERATIONS = 6

    for _ in range(MAX_ITERATIONS):
        response = client.messages.create(
            model=SONNET_MODEL,
            max_tokens=2048,
            system=system_prompt,
            tools=tools,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            text = next((b.text for b in response.content if hasattr(b, "text")), "")
            return {"reply": text, "tool_calls": tool_calls_log}

        if response.stop_reason == "tool_use":
            # アシスタントのメッセージをコンテキストに追加
            messages.append({
                "role": "assistant",
                "content": [_content_block_to_dict(b) for b in response.content],
            })

            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                result = _execute_tool(block.name, block.input, db, tenant_id)
                tool_calls_log.append({"tool": block.name, "input": block.input, "result": result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

            messages.append({"role": "user", "content": tool_results})

    return {"reply": "処理を完了できませんでした。もう一度お試しください。", "tool_calls": tool_calls_log}


def _content_block_to_dict(block) -> dict:
    if block.type == "text":
        return {"type": "text", "text": block.text}
    if block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    return {}


def _build_agent_tools() -> list:
    return [
        {
            "name": "search_materials",
            "description": "材料・在庫を検索する。在庫量の確認や材料IDの特定に使う。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "材料名やコードのキーワード（省略可）"},
                    "low_stock_only": {"type": "boolean", "description": "発注点以下のみ表示する場合true"},
                },
            },
        },
        {
            "name": "receive_stock",
            "description": "材料の入庫登録。指定した材料の在庫を増やす。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "material_id": {"type": "integer", "description": "材料ID（search_materialsで確認）"},
                    "quantity": {"type": "number", "description": "入庫数量"},
                    "note": {"type": "string", "description": "備考（任意）"},
                },
                "required": ["material_id", "quantity"],
            },
        },
        {
            "name": "issue_stock",
            "description": "材料の払出登録。指定した材料の在庫を減らす。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "material_id": {"type": "integer", "description": "材料ID"},
                    "quantity": {"type": "number", "description": "払出数量"},
                    "note": {"type": "string", "description": "備考（任意）"},
                },
                "required": ["material_id", "quantity"],
            },
        },
        {
            "name": "create_purchase_order",
            "description": "材料の発注を登録する。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "material_id": {"type": "integer"},
                    "supplier_name": {"type": "string", "description": "仕入先名"},
                    "quantity": {"type": "number", "description": "発注数量"},
                    "order_date": {"type": "string", "description": "発注日（YYYY-MM-DD）"},
                    "expected_delivery_date": {"type": "string", "description": "納入予定日（YYYY-MM-DD）"},
                    "unit_price": {"type": "number", "description": "単価（任意）"},
                    "note": {"type": "string", "description": "備考（任意）"},
                },
                "required": ["material_id", "supplier_name", "quantity", "order_date", "expected_delivery_date"],
            },
        },
        {
            "name": "search_orders",
            "description": "受注を検索・一覧取得する。受注番号・品名・ステータスで検索できる。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "品名や受注番号のキーワード（省略可）"},
                    "status": {"type": "string", "description": "pending / in_progress / done（省略可）"},
                },
            },
        },
        {
            "name": "search_customers",
            "description": "顧客を検索する。顧客名や顧客IDを確認するために使う。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "顧客名キーワード"},
                },
                "required": ["keyword"],
            },
        },
        {
            "name": "create_customer",
            "description": "新しい顧客を登録する。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "顧客コード（例: C010）"},
                    "name": {"type": "string", "description": "会社名"},
                    "contact_name": {"type": "string", "description": "担当者名（任意）"},
                    "phone": {"type": "string", "description": "電話番号（任意）"},
                    "email": {"type": "string", "description": "メールアドレス（任意）"},
                    "note": {"type": "string", "description": "備考（任意）"},
                },
                "required": ["code", "name"],
            },
        },
        {
            "name": "update_order",
            "description": "受注情報を変更する。納期・優先度・数量・ステータス・備考を更新できる。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "order_number": {"type": "string", "description": "受注番号（例: ORD-001）"},
                    "due_date": {"type": "string", "description": "新しい納期（YYYY-MM-DD形式）"},
                    "priority": {"type": "integer", "description": "優先度：1=特急、2=高、3=通常"},
                    "quantity": {"type": "integer", "description": "数量"},
                    "status": {"type": "string", "description": "ステータス：pending / in_progress / done"},
                    "note": {"type": "string", "description": "備考"},
                },
                "required": ["order_number"],
            },
        },
        {
            "name": "create_order",
            "description": "新しい受注を登録する。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "product_name": {"type": "string", "description": "品名"},
                    "product_code": {"type": "string", "description": "品番（任意）"},
                    "quantity": {"type": "integer", "description": "数量"},
                    "due_date": {"type": "string", "description": "納期（YYYY-MM-DD）"},
                    "priority": {"type": "integer", "description": "1=特急、2=高、3=通常"},
                    "customer_id": {"type": "integer", "description": "顧客ID（search_customersで確認）"},
                    "note": {"type": "string", "description": "備考（任意）"},
                },
                "required": ["product_name", "quantity", "due_date"],
            },
        },
        {
            "name": "get_schedule_summary",
            "description": "現在のスケジュール状況のサマリーを取得する。遅延・特急・今週の工程数などを確認できる。",
            "input_schema": {"type": "object", "properties": {}},
        },
        {
            "name": "run_schedule",
            "description": "スケジューリングを実行して計画日時を更新する。受注や工程を追加・変更した後に実行する。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "optimizer": {"type": "string", "description": "ortools（デフォルト）またはedd"},
                },
            },
        },
        # ── 制約設定ツール ──────────────────────────────────────────────
        {
            "name": "search_machines",
            "description": "設備を検索・一覧取得する。設備名・コード・グループ（machine_type）で絞り込める。制約変更前に設備IDを確認するために使う。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "設備名やコードのキーワード（省略可）"},
                    "include_inactive": {"type": "boolean", "description": "非稼働設備も含める場合true"},
                },
            },
        },
        {
            "name": "update_machine_status",
            "description": "設備の稼働状態（is_active）を変更する。故障・廃棄・復旧時に使う。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "machine_id": {"type": "integer", "description": "設備ID（search_machinesで確認）"},
                    "is_active": {"type": "boolean", "description": "true=稼働中、false=停止"},
                    "reason": {"type": "string", "description": "変更理由（任意）"},
                },
                "required": ["machine_id", "is_active"],
            },
        },
        {
            "name": "add_maintenance_window",
            "description": "設備のメンテナンス枠を登録する。点検・修理期間中は自動的にその設備への割り付けを回避する。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "machine_id": {"type": "integer", "description": "設備ID（search_machinesで確認）"},
                    "start_datetime": {"type": "string", "description": "開始日時（YYYY-MM-DDTHH:MM:SS形式）"},
                    "end_datetime": {"type": "string", "description": "終了日時（YYYY-MM-DDTHH:MM:SS形式）"},
                    "reason": {"type": "string", "description": "メンテナンス理由（例：月次点検、修理）"},
                },
                "required": ["machine_id", "start_datetime", "end_datetime"],
            },
        },
        {
            "name": "update_operation_constraint",
            "description": "工程の制約を変更する。設備固定・待機時間・開始不可日・スケジュールロック・特急フラグを設定できる。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "operation_id": {"type": "integer", "description": "工程ID（search_ordersで受注を特定後、工程一覧から確認）"},
                    "machine_locked": {"type": "boolean", "description": "true=設備固定（グループ内自動選択しない）"},
                    "machine_id": {"type": "integer", "description": "固定先設備ID（machine_lockedをtrueにする場合に指定）"},
                    "wait_hours_after": {"type": "number", "description": "工程完了後の待機時間（時間単位、例：8.0=8時間）"},
                    "not_before_date": {"type": "string", "description": "開始不可日（YYYY-MM-DD、この日より前に開始しない）"},
                    "schedule_locked": {"type": "boolean", "description": "true=スケジュール日時を固定（再スケジュールで変更しない）"},
                    "is_urgent": {"type": "boolean", "description": "true=この工程を特急扱いにする（スケジューリング優先度が上がる）"},
                },
                "required": ["operation_id"],
            },
        },
        {
            "name": "add_calendar_exception",
            "description": "工場カレンダーに例外日を追加する。全休日・半日稼働・特別稼働日を登録できる。複数日は複数回呼び出す。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "対象日（YYYY-MM-DD）"},
                    "working_hours": {"type": "number", "description": "稼働時間（0=全休、4=半日、8=通常。小数可）"},
                    "holiday_name": {"type": "string", "description": "名称（例：お盆休み、年末年始、創立記念日）"},
                },
                "required": ["date", "working_hours"],
            },
        },
        {
            "name": "explain_constraints",
            "description": "現在の制約設定（設備グループ・メンテナンス枠・カレンダー例外・ロック済み工程）を日本語でわかりやすく説明する。",
            "input_schema": {"type": "object", "properties": {}},
        },
        {
            "name": "create_machine",
            "description": "新しい設備マスタを登録する。設備名・設備コード・設備タイプ・段取り時間・バッチ容量・外注フラグ等を指定できる。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name":               {"type": "string",  "description": "設備名（例：旋盤1号機）"},
                    "code":               {"type": "string",  "description": "設備コード（例：LAT-001）"},
                    "machine_type":       {"type": "string",  "description": "設備タイプ/グループ名（例：旋盤）。同じタイプの設備は自動で代替選択される"},
                    "setup_time_minutes": {"type": "number",  "description": "段取り時間（分）。デフォルト0"},
                    "batch_capacity":     {"type": "integer", "description": "バッチ同時処理数。デフォルト1"},
                    "is_outsource":       {"type": "boolean", "description": "外注設備かどうか。デフォルトfalse"},
                    "outsource_lead_days":{"type": "number",  "description": "外注リードタイム日数（is_outsource=trueの場合）"},
                    "work_start_hour":    {"type": "integer", "description": "稼働開始時刻（時）。省略時はテナント設定を使用"},
                },
                "required": ["name", "code"],
            },
        },
        {
            "name": "create_process",
            "description": "新しい工程マスタを登録する。工程名・工程コード・標準時間・対象設備を指定できる。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name":              {"type": "string", "description": "工程名（例：旋盤加工）"},
                    "code":              {"type": "string", "description": "工程コード（例：PROC-001）"},
                    "default_hours":     {"type": "number", "description": "標準作業時間（時間）"},
                    "machine_type":      {"type": "string", "description": "対象設備タイプ（例：旋盤）"},
                },
                "required": ["name", "code"],
            },
        },
        {
            "name": "update_machine_capacity",
            "description": "設備の稼働能力設定を変更する。1日稼働時間・段取り時間・バッチ処理数・稼働開始時刻を変更できる。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "machine_id":            {"type": "integer", "description": "設備ID（search_machinesで確認）"},
                    "daily_capacity_hours":  {"type": "number",  "description": "1日稼働時間（時間。例：8.0）"},
                    "setup_time_minutes":    {"type": "number",  "description": "段取り時間（分。例：30）"},
                    "batch_capacity":        {"type": "integer", "description": "同時処理数（例：炉=4、通常=1）"},
                    "work_start_hour":       {"type": "integer", "description": "稼働開始時刻（時。例：8。省略するとテナント設定に従う）"},
                },
                "required": ["machine_id"],
            },
        },
        {
            "name": "update_tenant_settings",
            "description": "工場全体のスケジューリング設定を変更する。稼働開始時刻・1日稼働時間・土曜休日を変更できる。必ず確認後に実行すること。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "work_start_hour":    {"type": "integer", "description": "工場全体の稼働開始時刻（時。例：8）"},
                    "work_hours_per_day": {"type": "number",  "description": "工場全体の1日稼働時間（時間。例：8.0）"},
                    "saturday_off":       {"type": "boolean", "description": "true=土曜休日、false=土曜稼働"},
                },
            },
        },
    ]


def _execute_tool(name: str, params: dict, db: Session, tenant_id: int) -> dict:
    """ツール名と引数からDBアクセスを行い結果を返す"""
    today = date.today()

    if name == "search_materials":
        q = db.query(models.Material).filter(models.Material.tenant_id == tenant_id)
        if params.get("keyword"):
            kw = f"%{params['keyword']}%"
            q = q.filter(
                models.Material.material_name.ilike(kw) |
                models.Material.material_code.ilike(kw)
            )
        items = q.order_by(models.Material.material_code).all()
        if params.get("low_stock_only"):
            items = [m for m in items if m.stock_quantity <= m.reorder_point]
        return {
            "count": len(items),
            "materials": [
                {"id": m.id, "code": m.material_code, "name": m.material_name,
                 "stock": m.stock_quantity, "unit": m.unit,
                 "reorder_point": m.reorder_point,
                 "is_low_stock": m.stock_quantity <= m.reorder_point}
                for m in items
            ],
        }

    if name == "receive_stock":
        m = db.query(models.Material).filter(
            models.Material.id == params["material_id"],
            models.Material.tenant_id == tenant_id,
        ).first()
        if not m:
            return {"error": "材料が見つかりません"}
        before = m.stock_quantity
        m.stock_quantity += params["quantity"]
        db.add(models.MaterialStockLog(
            tenant_id=tenant_id, material_id=m.id,
            action="receive", quantity=params["quantity"],
            note=params.get("note"),
        ))
        db.commit()
        return {"success": True, "material_name": m.material_name, "unit": m.unit,
                "before": before, "after": m.stock_quantity, "quantity": params["quantity"]}

    if name == "issue_stock":
        m = db.query(models.Material).filter(
            models.Material.id == params["material_id"],
            models.Material.tenant_id == tenant_id,
        ).first()
        if not m:
            return {"error": "材料が見つかりません"}
        before = m.stock_quantity
        m.stock_quantity -= params["quantity"]
        db.add(models.MaterialStockLog(
            tenant_id=tenant_id, material_id=m.id,
            action="issue", quantity=-params["quantity"],
            note=params.get("note"),
        ))
        db.commit()
        return {"success": True, "material_name": m.material_name, "unit": m.unit,
                "before": before, "after": m.stock_quantity, "quantity": params["quantity"]}

    if name == "create_purchase_order":
        m = db.query(models.Material).filter(
            models.Material.id == params["material_id"],
            models.Material.tenant_id == tenant_id,
        ).first()
        if not m:
            return {"error": "材料が見つかりません"}
        # 発注番号採番
        year = today.year
        prefix = f"PO-{year}-"
        count = db.query(models.PurchaseOrder).filter(
            models.PurchaseOrder.tenant_id == tenant_id,
            models.PurchaseOrder.po_number.like(f"{prefix}%"),
        ).count()
        po = models.PurchaseOrder(
            tenant_id=tenant_id,
            po_number=f"{prefix}{count+1:03d}",
            material_id=params["material_id"],
            supplier_name=params["supplier_name"],
            quantity=params["quantity"],
            unit_price=params.get("unit_price"),
            order_date=date.fromisoformat(params["order_date"]),
            expected_delivery_date=date.fromisoformat(params["expected_delivery_date"]),
            note=params.get("note"),
        )
        db.add(po)
        db.commit()
        db.refresh(po)
        return {"success": True, "po_number": po.po_number,
                "material_name": m.material_name, "quantity": params["quantity"],
                "unit": m.unit, "expected_delivery_date": params["expected_delivery_date"]}

    if name == "search_orders":
        q = (db.query(models.Order)
             .filter(models.Order.tenant_id == tenant_id)
             .order_by(models.Order.due_date))
        if params.get("status"):
            q = q.filter(models.Order.status == params["status"])
        if params.get("keyword"):
            kw = f"%{params['keyword']}%"
            q = q.filter(
                models.Order.product_name.ilike(kw) |
                models.Order.order_number.ilike(kw)
            )
        orders = q.limit(10).all()
        return {
            "count": len(orders),
            "orders": [
                {"id": o.id, "order_number": o.order_number, "product_name": o.product_name,
                 "quantity": o.quantity, "due_date": str(o.due_date),
                 "status": o.status, "priority": o.priority}
                for o in orders
            ],
        }

    if name == "search_customers":
        kw = f"%{params.get('keyword', '')}%"
        customers = db.query(models.Customer).filter(
            models.Customer.tenant_id == tenant_id,
            models.Customer.name.ilike(kw),
        ).all()
        return {
            "count": len(customers),
            "customers": [{"id": c.id, "code": c.code, "name": c.name,
                           "contact_name": c.contact_name, "phone": c.phone}
                          for c in customers],
        }

    if name == "create_customer":
        existing = db.query(models.Customer).filter(
            models.Customer.tenant_id == tenant_id,
            models.Customer.code == params["code"],
        ).first()
        if existing:
            return {"error": f"顧客コード {params['code']} はすでに登録済みです"}
        c = models.Customer(
            tenant_id=tenant_id,
            code=params["code"],
            name=params["name"],
            contact_name=params.get("contact_name"),
            phone=params.get("phone"),
            email=params.get("email"),
            note=params.get("note"),
        )
        db.add(c)
        db.commit()
        db.refresh(c)
        return {"success": True, "id": c.id, "code": c.code, "name": c.name}

    if name == "update_order":
        order_number = params.get("order_number")
        order = db.query(models.Order).filter(
            models.Order.tenant_id == tenant_id,
            models.Order.order_number == order_number,
        ).first()
        if not order:
            return {"error": f"受注番号 {order_number} が見つかりません"}

        changes = {}
        if "due_date" in params:
            old = str(order.due_date)
            order.due_date = date.fromisoformat(params["due_date"])
            changes["due_date"] = {"before": old, "after": params["due_date"]}
        if "priority" in params:
            label = {1: "特急", 2: "高", 3: "通常"}
            old = order.priority
            order.priority = params["priority"]
            changes["priority"] = {"before": f"{old}（{label.get(old,old)}）", "after": f"{params['priority']}（{label.get(params['priority'],params['priority'])}）"}
        if "quantity" in params:
            old = order.quantity
            order.quantity = params["quantity"]
            changes["quantity"] = {"before": old, "after": params["quantity"]}
        if "status" in params:
            old = order.status
            order.status = params["status"]
            changes["status"] = {"before": old, "after": params["status"]}
        if "note" in params:
            old = order.note
            order.note = params["note"]
            changes["note"] = {"before": old, "after": params["note"]}

        if not changes:
            return {"error": "変更する項目が指定されていません"}

        db.commit()
        return {
            "success": True,
            "order_number": order_number,
            "product_name": order.product_name,
            "changes": changes,
        }

    if name == "create_order":
        # 受注番号を採番
        count = db.query(models.Order).filter(models.Order.tenant_id == tenant_id).count()
        order_number = f"ORD-{count + 1:03d}"
        # 重複回避
        while db.query(models.Order).filter(
            models.Order.tenant_id == tenant_id,
            models.Order.order_number == order_number,
        ).first():
            count += 1
            order_number = f"ORD-{count:03d}"

        order = models.Order(
            tenant_id=tenant_id,
            order_number=order_number,
            product_name=params["product_name"],
            product_code=params.get("product_code") or params["product_name"][:10],
            quantity=params["quantity"],
            due_date=date.fromisoformat(params["due_date"]),
            priority=params.get("priority", 3),
            customer_id=params.get("customer_id"),
            note=params.get("note"),
            status="pending",
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return {
            "success": True,
            "order_number": order.order_number,
            "product_name": order.product_name,
            "quantity": order.quantity,
            "due_date": str(order.due_date),
            "priority": order.priority,
        }

    if name == "get_schedule_summary":
        from datetime import datetime
        week_end = today + timedelta(days=7)
        ops = (
            db.query(models.Operation)
            .join(models.Order)
            .filter(
                models.Operation.tenant_id == tenant_id,
                models.Order.status != "done",
                models.Operation.planned_start.isnot(None),
            ).all()
        )
        urgent = len(set(op.order_id for op in ops if op.is_urgent))
        delayed = []
        for op in ops:
            if op.planned_end and op.order.due_date:
                due_dt = datetime(op.order.due_date.year, op.order.due_date.month,
                                  op.order.due_date.day, 17, 0)
                if op.planned_end > due_dt:
                    delayed.append(op.order.order_number)
        week_ops = [op for op in ops if op.planned_start and op.planned_start.date() <= week_end]
        return {
            "total_active_orders": len(set(op.order_id for op in ops)),
            "urgent_orders": urgent,
            "delayed_orders": len(set(delayed)),
            "delayed_order_numbers": list(set(delayed))[:5],
            "this_week_operations": len(week_ops),
        }

    if name == "search_machines":
        q = db.query(models.Machine).filter(models.Machine.tenant_id == tenant_id)
        if not params.get("include_inactive"):
            q = q.filter(models.Machine.is_active == True)
        if params.get("keyword"):
            kw = f"%{params['keyword']}%"
            q = q.filter(
                models.Machine.name.ilike(kw) | models.Machine.code.ilike(kw)
            )
        machines = q.order_by(models.Machine.id).all()
        return {
            "count": len(machines),
            "machines": [
                {
                    "id": m.id, "name": m.name, "code": m.code,
                    "machine_type": m.machine_type,
                    "is_active": m.is_active, "is_outsource": m.is_outsource,
                    "daily_capacity_hours": m.daily_capacity_hours,
                    "batch_capacity": m.batch_capacity,
                    "setup_time_minutes": m.setup_time_minutes,
                }
                for m in machines
            ],
        }

    if name == "update_machine_status":
        machine = db.query(models.Machine).filter(
            models.Machine.id == params["machine_id"],
            models.Machine.tenant_id == tenant_id,
        ).first()
        if not machine:
            return {"error": f"設備ID {params['machine_id']} が見つかりません"}
        before = machine.is_active
        machine.is_active = params["is_active"]
        db.commit()
        # 影響を受ける工程数
        affected = db.query(models.Operation).filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.machine_id == machine.id,
            models.Operation.planned_start.isnot(None),
        ).count()
        return {
            "success": True,
            "machine_name": machine.name,
            "before": "稼働中" if before else "停止中",
            "after": "稼働中" if params["is_active"] else "停止中",
            "affected_operations": affected,
            "message": f"{machine.name} を{'稼働中' if params['is_active'] else '停止中'}に変更しました。影響工程数: {affected}件",
        }

    if name == "add_maintenance_window":
        machine = db.query(models.Machine).filter(
            models.Machine.id == params["machine_id"],
            models.Machine.tenant_id == tenant_id,
        ).first()
        if not machine:
            return {"error": f"設備ID {params['machine_id']} が見つかりません"}
        from datetime import datetime as dt
        start = dt.fromisoformat(params["start_datetime"])
        end = dt.fromisoformat(params["end_datetime"])
        if end <= start:
            return {"error": "終了日時は開始日時より後にしてください"}
        mw = models.MachineMaintenance(
            tenant_id=tenant_id,
            machine_id=machine.id,
            start_datetime=start,
            end_datetime=end,
            reason=params.get("reason"),
        )
        db.add(mw)
        db.commit()
        db.refresh(mw)
        # 期間中に予定されている工程数
        ops_in_window = db.query(models.Operation).filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.machine_id == machine.id,
            models.Operation.planned_start < end,
            models.Operation.planned_end > start,
        ).count()
        return {
            "success": True,
            "id": mw.id,
            "machine_name": machine.name,
            "start": params["start_datetime"],
            "end": params["end_datetime"],
            "reason": params.get("reason"),
            "ops_in_window": ops_in_window,
            "message": f"{machine.name} に {start.strftime('%m/%d %H:%M')}〜{end.strftime('%m/%d %H:%M')} のメンテナンス枠を登録しました。期間中の予定工程: {ops_in_window}件",
        }

    if name == "update_operation_constraint":
        op = db.query(models.Operation).filter(
            models.Operation.id == params["operation_id"],
            models.Operation.tenant_id == tenant_id,
        ).first()
        if not op:
            return {"error": f"工程ID {params['operation_id']} が見つかりません"}

        changes = {}
        if "machine_locked" in params:
            op.machine_locked = params["machine_locked"]
            changes["machine_locked"] = params["machine_locked"]
        if "machine_id" in params:
            machine = db.query(models.Machine).filter(
                models.Machine.id == params["machine_id"],
                models.Machine.tenant_id == tenant_id,
            ).first()
            if not machine:
                return {"error": f"設備ID {params['machine_id']} が見つかりません"}
            op.machine_id = params["machine_id"]
            changes["machine_id"] = f"{machine.name}（ID:{machine.id}）"
        if "wait_hours_after" in params:
            op.wait_hours_after = params["wait_hours_after"]
            changes["wait_hours_after"] = f"{params['wait_hours_after']}時間"
        if "not_before_date" in params:
            op.not_before_date = date.fromisoformat(params["not_before_date"])
            changes["not_before_date"] = params["not_before_date"]
        if "schedule_locked" in params:
            op.schedule_locked = params["schedule_locked"]
            changes["schedule_locked"] = params["schedule_locked"]
        if "is_urgent" in params:
            op.is_urgent = params["is_urgent"]
            changes["is_urgent"] = "特急" if params["is_urgent"] else "通常"

        if not changes:
            return {"error": "変更する制約が指定されていません"}

        db.commit()
        order_num = op.order.order_number if op.order else "不明"
        return {
            "success": True,
            "operation_id": op.id,
            "order_number": order_num,
            "sequence": op.sequence,
            "changes": changes,
            "message": f"{order_num} 工程{op.sequence} の制約を更新しました: {changes}",
        }

    if name == "add_calendar_exception":
        target_date = date.fromisoformat(params["date"])
        # 重複確認（同日があれば更新）
        existing = db.query(models.CalendarHoliday).filter(
            models.CalendarHoliday.tenant_id == tenant_id,
            models.CalendarHoliday.date == target_date,
        ).first()
        hours = params["working_hours"]
        name_label = params.get("holiday_name", "例外日")
        if existing:
            before_hours = existing.working_hours
            existing.working_hours = hours
            existing.holiday_name = name_label
            db.commit()
            kind = "全休" if hours == 0 else f"稼働{hours}時間"
            return {
                "success": True, "updated": True,
                "date": params["date"], "working_hours": hours, "holiday_name": name_label,
                "message": f"{params['date']} を {kind}（{name_label}）に更新しました（旧: {before_hours}時間）",
            }
        holiday = models.CalendarHoliday(
            tenant_id=tenant_id,
            date=target_date,
            working_hours=hours,
            holiday_name=name_label,
        )
        db.add(holiday)
        db.commit()
        kind = "全休" if hours == 0 else f"稼働{hours}時間"
        return {
            "success": True, "created": True,
            "date": params["date"], "working_hours": hours, "holiday_name": name_label,
            "message": f"{params['date']} を {kind}（{name_label}）に設定しました",
        }

    if name == "explain_constraints":
        from datetime import datetime as dt
        now = dt.now()
        # 設備グループ
        machines = db.query(models.Machine).filter(
            models.Machine.tenant_id == tenant_id,
            models.Machine.is_active == True,
        ).all()
        inactive_machines = db.query(models.Machine).filter(
            models.Machine.tenant_id == tenant_id,
            models.Machine.is_active == False,
        ).all()
        groups: dict = {}
        for m in machines:
            if m.machine_type:
                groups.setdefault(m.machine_type, []).append(m.name)
        # メンテナンス枠（未来のもの）
        maint_list = db.query(models.MachineMaintenance).filter(
            models.MachineMaintenance.tenant_id == tenant_id,
            models.MachineMaintenance.end_datetime >= now,
        ).order_by(models.MachineMaintenance.start_datetime).all()
        maint_map = {m.id: m.name for m in db.query(models.Machine).filter(
            models.Machine.tenant_id == tenant_id,
        ).all()}
        # カレンダー例外（今後3ヶ月）
        future = date.today() + timedelta(days=90)
        holidays = db.query(models.CalendarHoliday).filter(
            models.CalendarHoliday.tenant_id == tenant_id,
            models.CalendarHoliday.date >= date.today(),
            models.CalendarHoliday.date <= future,
        ).order_by(models.CalendarHoliday.date).all()
        # ロック済み工程
        locked_ops = db.query(models.Operation).filter(
            models.Operation.tenant_id == tenant_id,
            models.Operation.schedule_locked == True,
        ).all()
        return {
            "machine_groups": {k: v for k, v in groups.items()},
            "inactive_machines": [m.name for m in inactive_machines],
            "upcoming_maintenance": [
                {
                    "machine": maint_map.get(mw.machine_id, f"ID:{mw.machine_id}"),
                    "start": mw.start_datetime.strftime("%Y/%m/%d %H:%M"),
                    "end": mw.end_datetime.strftime("%Y/%m/%d %H:%M"),
                    "reason": mw.reason,
                }
                for mw in maint_list
            ],
            "calendar_exceptions": [
                {
                    "date": str(h.date),
                    "working_hours": h.working_hours,
                    "name": h.holiday_name,
                    "type": "全休" if h.working_hours == 0 else f"短縮稼働({h.working_hours}h)",
                }
                for h in holidays
            ],
            "locked_operations_count": len(locked_ops),
            "locked_operations": [
                {"operation_id": op.id, "order": op.order.order_number if op.order else "?", "sequence": op.sequence}
                for op in locked_ops[:5]
            ],
        }

    if name == "create_machine":
        existing = db.query(models.Machine).filter(
            models.Machine.tenant_id == tenant_id,
            models.Machine.code == params["code"],
        ).first()
        if existing:
            return {"success": False, "message": f"設備コード '{params['code']}' は既に登録されています（{existing.name}）"}
        machine = models.Machine(
            tenant_id=tenant_id,
            name=params["name"],
            code=params["code"],
            machine_type=params.get("machine_type"),
            setup_time_minutes=params.get("setup_time_minutes", 0),
            batch_capacity=params.get("batch_capacity", 1),
            is_outsource=params.get("is_outsource", False),
            outsource_lead_days=params.get("outsource_lead_days"),
            work_start_hour=params.get("work_start_hour"),
            is_active=True,
        )
        db.add(machine)
        db.commit()
        db.refresh(machine)
        return {
            "success": True,
            "id": machine.id,
            "name": machine.name,
            "code": machine.code,
            "machine_type": machine.machine_type,
            "message": f"設備「{machine.name}」（{machine.code}）を登録しました",
        }

    if name == "create_process":
        existing = db.query(models.Process).filter(
            models.Process.tenant_id == tenant_id,
            models.Process.code == params["code"],
        ).first()
        if existing:
            return {"success": False, "message": f"工程コード '{params['code']}' は既に登録されています（{existing.name}）"}
        process = models.Process(
            tenant_id=tenant_id,
            name=params["name"],
            code=params["code"],
            default_hours=params.get("default_hours"),
            machine_type=params.get("machine_type"),
        )
        db.add(process)
        db.commit()
        db.refresh(process)
        return {
            "success": True,
            "id": process.id,
            "name": process.name,
            "code": process.code,
            "message": f"工程「{process.name}」（{process.code}）を登録しました",
        }

    if name == "update_machine_capacity":
        machine = db.query(models.Machine).filter(
            models.Machine.id == params["machine_id"],
            models.Machine.tenant_id == tenant_id,
        ).first()
        if not machine:
            return {"error": f"設備ID {params['machine_id']} が見つかりません"}
        changes = {}
        if "daily_capacity_hours" in params:
            machine.daily_capacity_hours = params["daily_capacity_hours"]
            changes["daily_capacity_hours"] = f"{params['daily_capacity_hours']}時間/日"
        if "setup_time_minutes" in params:
            machine.setup_time_minutes = params["setup_time_minutes"]
            changes["setup_time_minutes"] = f"{params['setup_time_minutes']}分"
        if "batch_capacity" in params:
            machine.batch_capacity = params["batch_capacity"]
            changes["batch_capacity"] = f"同時{params['batch_capacity']}件"
        if "work_start_hour" in params:
            machine.work_start_hour = params["work_start_hour"] if params["work_start_hour"] is not None else None
            changes["work_start_hour"] = f"{params['work_start_hour']}時" if params["work_start_hour"] is not None else "テナント設定に従う"
        if not changes:
            return {"error": "変更する項目が指定されていません"}
        db.commit()
        return {
            "success": True,
            "machine_id": machine.id,
            "machine_name": machine.name,
            "changes": changes,
            "message": f"設備「{machine.name}」の稼働能力を更新しました: {changes}",
        }

    if name == "update_tenant_settings":
        s = db.query(models.TenantSettings).filter(
            models.TenantSettings.tenant_id == tenant_id,
        ).first()
        if not s:
            s = models.TenantSettings(tenant_id=tenant_id, work_start_hour=8, work_hours_per_day=8.0, saturday_off=False)
            db.add(s)
        changes = {}
        if "work_start_hour" in params:
            s.work_start_hour = params["work_start_hour"]
            changes["work_start_hour"] = f"{params['work_start_hour']}時開始"
        if "work_hours_per_day" in params:
            s.work_hours_per_day = params["work_hours_per_day"]
            changes["work_hours_per_day"] = f"{params['work_hours_per_day']}時間/日"
        if "saturday_off" in params:
            s.saturday_off = params["saturday_off"]
            changes["saturday_off"] = "土曜休日" if params["saturday_off"] else "土曜稼働"
        if not changes:
            return {"error": "変更する項目が指定されていません"}
        db.commit()
        return {
            "success": True,
            "changes": changes,
            "message": f"工場設定を更新しました: {changes}",
        }

    if name == "run_schedule":
        try:
            from app.scheduler.ortools_engine import ORToolsSchedulingEngine
            _ortools_ok = True
        except Exception:
            _ortools_ok = False
        from app.scheduler.engine import SchedulingEngine, OperationInput, MachineCalendar
        optimizer = params.get("optimizer", "ortools")
        machines = db.query(models.Machine).filter(
            models.Machine.tenant_id == tenant_id,
            models.Machine.is_active == True,
        ).all()
        holidays = db.query(models.CalendarHoliday).filter(
            models.CalendarHoliday.tenant_id == tenant_id,
            models.CalendarHoliday.working_hours == 0,
        ).all()
        non_working = [h.date for h in holidays]
        calendars = {m.id: MachineCalendar(m.id, m.daily_capacity_hours, non_working_days=non_working)
                     for m in machines}
        engine = ORToolsSchedulingEngine(calendars) if (optimizer == "ortools" and _ortools_ok) else SchedulingEngine(calendars)
        ops_db = (
            db.query(models.Operation)
            .join(models.Order)
            .filter(models.Operation.tenant_id == tenant_id, models.Order.status != "done")
            .all()
        )
        op_inputs = [
            OperationInput(
                order_id=op.order.id, order_number=op.order.order_number,
                product_name=op.order.product_name, sequence=op.sequence,
                machine_id=op.machine_id, duration_hours=op.duration_hours,
                due_date=op.order.due_date, priority=op.order.priority, is_urgent=op.is_urgent,
            )
            for op in ops_db
        ]
        if not op_inputs:
            return {"success": True, "message": "スケジュールする受注がありません", "scheduled": 0}
        results = engine.schedule(op_inputs)
        for result in results:
            for op in db.query(models.Operation).filter(
                models.Operation.tenant_id == tenant_id,
                models.Operation.order_id == result.order_id,
                models.Operation.sequence == result.sequence,
                models.Operation.machine_id == result.machine_id,
            ).all():
                op.planned_start = result.planned_start
                op.planned_end = result.planned_end
        db.commit()
        delayed = [r for r in results if r.is_delayed]
        return {"success": True, "scheduled": len(results),
                "delayed_count": len(delayed),
                "delayed_orders": [r.order_number for r in delayed][:5]}

    return {"error": f"未知のツール: {name}"}


@router.post("/gantt-summary")
def gantt_summary(
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    現在のガントデータのサマリーをAIが生成する（状況確認チャット用のコンテキスト取得）。
    """
    from datetime import datetime
    today = date.today()
    week_end = today + timedelta(days=7)

    ops = (
        db.query(models.Operation)
        .join(models.Order)
        .join(models.Machine)
        .filter(
            models.Operation.tenant_id == tenant_id,
            models.Order.status != "done",
            models.Operation.planned_start != None,
        )
        .all()
    )

    urgent_orders = [op for op in ops if op.is_urgent]
    delayed_ops = []
    week_ops = []

    for op in ops:
        if op.planned_end and op.order.due_date:
            due_dt = datetime(op.order.due_date.year, op.order.due_date.month,
                              op.order.due_date.day, 17, 0)
            if op.planned_end > due_dt:
                delayed_ops.append(op)
        if op.planned_start and op.planned_start.date() <= week_end:
            week_ops.append(op)

    # コンテキスト文字列を生成
    lines = [
        f"集計日: {today.isoformat()}",
        f"進行中・未着手受注: {len(set(op.order_id for op in ops))} 件",
        f"特急受注: {len(set(op.order_id for op in urgent_orders))} 件",
        f"納期超過（予定）: {len(set(op.order_id for op in delayed_ops))} 件",
        f"今週の工程: {len(week_ops)} 件",
    ]

    if delayed_ops:
        delay_orders = list(set(op.order.order_number for op in delayed_ops))[:5]
        lines.append(f"遅延受注番号（抜粋）: {', '.join(delay_orders)}")

    # 設備別稼働状況
    machine_loads: dict[str, int] = {}
    for op in week_ops:
        name = op.machine.name
        machine_loads[name] = machine_loads.get(name, 0) + 1
    if machine_loads:
        load_str = "、".join([f"{k}: {v}工程" for k, v in list(machine_loads.items())[:5]])
        lines.append(f"今週の設備稼働（上位）: {load_str}")

    return {"context": "\n".join(lines)}
