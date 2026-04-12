import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL", "takuya.yoshikawa114@outlook.jp")
FROM_EMAIL = os.getenv("FROM_EMAIL", "onboarding@resend.dev")


def _send_notification(inquiry: models.Inquiry) -> None:
    """お問い合わせ受信を Resend でメール通知する。APIキー未設定時はスキップ。"""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY が未設定のためメール通知をスキップしました")
        return

    try:
        import resend
        resend.api_key = RESEND_API_KEY

        body = f"""\
<p>新しいお問い合わせが届きました。</p>
<hr>
<table>
  <tr><td><b>会社名</b></td><td>{inquiry.tenant_name}</td></tr>
  <tr><td><b>メール</b></td><td>{inquiry.user_email}</td></tr>
  <tr><td><b>担当者名</b></td><td>{inquiry.user_name or "（未設定）"}</td></tr>
  <tr><td><b>受付日時</b></td><td>{inquiry.created_at}</td></tr>
</table>
<hr>
<p><b>お問い合わせ内容:</b></p>
<p style="white-space:pre-wrap">{inquiry.message}</p>
"""
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": NOTIFY_EMAIL,
            "subject": f"【Operun】お問い合わせが届きました（{inquiry.tenant_name}）",
            "html": body,
        })
    except Exception as e:
        logger.error(f"メール送信に失敗しました: {e}")


class InquiryIn(BaseModel):
    message: str


class InquiryOut(BaseModel):
    id: int
    message: str


@router.post("", response_model=InquiryOut, status_code=201)
def create_inquiry(
    payload: InquiryIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not payload.message.strip():
        raise HTTPException(status_code=422, detail="お問い合わせ内容を入力してください")

    tenant = db.query(models.Tenant).filter(models.Tenant.id == current_user.tenant_id).first()
    tenant_name = tenant.name if tenant else "不明"

    inquiry = models.Inquiry(
        tenant_id=current_user.tenant_id,
        tenant_name=tenant_name,
        user_email=current_user.email,
        user_name=current_user.name,
        message=payload.message.strip(),
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)

    _send_notification(inquiry)

    return InquiryOut(id=inquiry.id, message=inquiry.message)
