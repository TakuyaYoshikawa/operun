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

HAIKU_MODEL = "claude-haiku-4-5-20251001"

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
