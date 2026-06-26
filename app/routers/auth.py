from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import create_session, delete_session, get_current_user, get_db, hash_password, verify_password
from app.database.models import User

router = APIRouter()
EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=256)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return normalized


def _normalize_full_name(full_name: Optional[str], email: str) -> str:
    if full_name and full_name.strip():
        return full_name.strip()

    local_part = email.split("@", 1)[0]
    candidate = re.sub(r"[._-]+", " ", local_part).strip()
    return candidate.title() or email


@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    full_name = _normalize_full_name(payload.full_name, email)
    if not payload.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty.")

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user)
    return {
        "token": token,
        "user": _serialize_user(user),
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    if not payload.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty.")

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_session(db, user)
    return {
        "token": token,
        "user": _serialize_user(user),
    }


@router.get("/me")
def auth_me(user: User = Depends(get_current_user)):
    return {"user": _serialize_user(user)}


@router.post("/logout")
def logout(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    del user
    if authorization and authorization.startswith("Bearer "):
        delete_session(db, authorization.removeprefix("Bearer ").strip())
    return {"message": "Logged out successfully."}


def me(user: User = Depends(get_current_user)):
    return {"user": _serialize_user(user)}
