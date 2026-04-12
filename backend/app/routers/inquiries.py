import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

SMTP_HOST = "smtp-mail.outlook.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER", "")       # takuya.yoshikawa114@outlook.jp
SMTP_PASS = os.getenv("SMTP_PASS", "")
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL", SMTP_USER)


def _send_notification(inquiry: models.Inquiry) -> None:
    """お問い合わせ受信をメールで通知する。設定がなければスキップ。"""
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP_USER/SMTP_PASS が未設定のためメール通知をスキップしました")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"【Operun】お問い合わせが届きました（{inquiry.tenant_name}）"
    msg["From"] = SMTP_USER
    msg["To"] = NOTIFY_EMAIL

    body = f"""\
新しいお問い合わせが届きました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
会社名　　: {inquiry.tenant_name}
メール　　: {inquiry.user_email}
担当者名　: {inquiry.user_name or "（未設定）"}
受付日時　: {inquiry.created_at}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【お問い合わせ内容】
{inquiry.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
このメールは Operun システムから自動送信されています。
"""
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.sendmail(SMTP_USER, NOTIFY_EMAIL, msg.as_string())
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
