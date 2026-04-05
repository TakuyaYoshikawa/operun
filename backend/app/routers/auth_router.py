from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime

from app.database import get_db
from app import models
from app.auth import authenticate_user, create_access_token, hash_password

router = APIRouter()


class TenantRegister(BaseModel):
    company_name: str
    email: str
    password: str
    user_name: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str
    tenant_id: int
    tenant_name: str
    user_name: str | None


class MeOut(BaseModel):
    user_id: int
    email: str
    name: str | None
    tenant_id: int
    tenant_name: str
    plan: str


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: TenantRegister, db: Session = Depends(get_db)):
    """
    テナント（会社）とユーザーを同時に作成する。
    サインアップ用エンドポイント。
    """
    # メールアドレスの重複チェック
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="このメールアドレスは既に登録済みです")

    # テナント作成
    tenant = models.Tenant(name=payload.company_name, plan="trial")
    db.add(tenant)
    db.flush()

    # ユーザー作成
    user = models.User(
        tenant_id=tenant.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        name=payload.user_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=user.id, tenant_id=tenant.id)
    return TokenOut(
        access_token=token,
        token_type="bearer",
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        user_name=user.name,
    )


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    メール・パスワードでログインしてJWTを返す。
    Swagger UI の「Authorize」からも使用可能。
    """
    user = authenticate_user(form.username, form.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user_id=user.id, tenant_id=user.tenant_id)
    return TokenOut(
        access_token=token,
        token_type="bearer",
        tenant_id=user.tenant_id,
        tenant_name=user.tenant.name,
        user_name=user.name,
    )
