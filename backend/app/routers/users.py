"""
ユーザー管理ルーター
同一テナント内のユーザー招待・一覧・更新・削除を提供する。
admin ロールのユーザーのみ招待・ロール変更・無効化が可能。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app import models
from app.auth import get_current_user, require_admin, hash_password

router = APIRouter()


# ── スキーマ ──────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str]
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class UserInvite(BaseModel):
    email: str
    name: Optional[str] = None
    password: str
    role: str = "member"   # admin / member


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None   # パスワード変更（任意）


# ── エンドポイント ──────────────────────────────────────────────────────────────

@router.get("/", response_model=list[UserOut])
def list_users(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """同一テナントのユーザー一覧を返す（全員が閲覧可能）。"""
    return (
        db.query(models.User)
        .filter(models.User.tenant_id == current_user.tenant_id)
        .order_by(models.User.id)
        .all()
    )


@router.post("/invite", response_model=UserOut, status_code=201)
def invite_user(
    payload: UserInvite,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    同一テナントに新しいユーザーを追加する（admin のみ）。
    メール送信は行わず、管理者が初期パスワードを直接伝える運用を想定。
    """
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="このメールアドレスは既に登録済みです")
    if payload.role not in ("admin", "member"):
        raise HTTPException(status_code=422, detail="role は admin または member のみ指定可能です")

    user = models.User(
        tenant_id=current_user.tenant_id,
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    ユーザー情報を更新する。
    - admin: 同テナント全員を更新可能（ロール変更・無効化含む）
    - member: 自分自身の name・password のみ変更可
    """
    target = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.tenant_id == current_user.tenant_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")

    is_admin = getattr(current_user, "role", "member") == "admin"
    is_self  = current_user.id == user_id

    # 権限チェック
    if not is_admin and not is_self:
        raise HTTPException(status_code=403, detail="他のユーザーを変更する権限がありません")
    if not is_admin and (payload.role is not None or payload.is_active is not None):
        raise HTTPException(status_code=403, detail="ロールや有効状態の変更は管理者のみ可能です")

    # 自分を admin → member に降格させない（最後の admin 保護）
    if is_self and payload.role == "member" and current_user.role == "admin":
        admin_count = db.query(models.User).filter(
            models.User.tenant_id == current_user.tenant_id,
            models.User.role == "admin",
            models.User.is_active == True,
        ).count()
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="最後の管理者のロールは変更できません")

    if payload.name is not None:
        target.name = payload.name
    if payload.role is not None:
        if payload.role not in ("admin", "member"):
            raise HTTPException(status_code=422, detail="role は admin または member のみ指定可能です")
        target.role = payload.role
    if payload.is_active is not None:
        if not is_admin:
            raise HTTPException(status_code=403, detail="管理者のみ有効状態を変更できます")
        # 最後の admin を無効化しない
        if not payload.is_active and target.role == "admin":
            admin_count = db.query(models.User).filter(
                models.User.tenant_id == current_user.tenant_id,
                models.User.role == "admin",
                models.User.is_active == True,
            ).count()
            if admin_count <= 1:
                raise HTTPException(status_code=409, detail="最後の管理者を無効化することはできません")
        target.is_active = payload.is_active
    if payload.password:
        target.hashed_password = hash_password(payload.password)

    db.commit()
    db.refresh(target)
    return target
