from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database.database import SessionLocal
from app.database.models import AuthSession, User
from app.logging_utils import bind_log_context

SESSION_TTL_DAYS = 30


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str, salt: Optional[str] = None) -> str:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt.encode("utf-8"),
        390000,
    ).hex()
    return f"{password_salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected_digest = stored_hash.split("$", 1)
    except ValueError:
        return False

    candidate_digest = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate_digest, expected_digest)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(48)
    session = AuthSession(
        user_id=user.id,
        token_hash=_hash_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def delete_session(db: Session, token: str) -> None:
    token_hash = _hash_token(token)
    db.query(AuthSession).filter(AuthSession.token_hash == token_hash).delete()
    db.commit()


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")

    token_hash = _hash_token(token)
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token_hash == token_hash)
        .first()
    )

    if not session:
        raise HTTPException(status_code=401, detail="Invalid session.")

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired.")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail="User not found.")

    bind_log_context(user_id=user.id)
    return user
