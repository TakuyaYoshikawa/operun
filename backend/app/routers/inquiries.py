from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter()


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
    return InquiryOut(id=inquiry.id, message=inquiry.message)
