from __future__ import annotations

from typing import Optional

from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.database.models import Job, UserJob


def get_user_job_by_id(db: Session, user_job_id: int, user_id: int) -> Optional[UserJob]:
    return (
        db.query(UserJob)
        .options(joinedload(UserJob.job))
        .filter(UserJob.id == user_job_id, UserJob.user_id == user_id)
        .first()
    )


def get_user_job_by_job_id(db: Session, user_id: int, job_id: int) -> Optional[UserJob]:
    return db.query(UserJob).filter(UserJob.user_id == user_id, UserJob.job_id == job_id).first()


def get_global_job_by_identity(db: Session, source: str, external_id: str, url: str) -> Optional[Job]:
    if external_id:
        existing = db.query(Job).filter(Job.source == source, Job.external_id == external_id).first()
        if existing:
            return existing
    if url:
        return db.query(Job).filter(Job.url == url).first()
    return None


def _build_user_jobs_query(db: Session, user_id: int, statuses: Optional[list[str]] = None):
    priority_order = case(
        (UserJob.apply_priority == "HIGH", 3),
        (UserJob.apply_priority == "MEDIUM", 2),
        (UserJob.apply_priority == "LOW", 1),
        else_=0,
    )
    applied_status_order = case(
        (UserJob.status == "applied", 1),
        else_=0,
    )
    query = (
        db.query(UserJob)
        .options(joinedload(UserJob.job))
        .join(Job, UserJob.job_id == Job.id)
        .filter(UserJob.user_id == user_id)
    )

    if statuses:
        query = query.filter(UserJob.status.in_(statuses))
        if statuses == ["applied"]:
            return query.order_by(
                UserJob.applied_at.desc().nullslast(),
                UserJob.updated_at.desc(),
                UserJob.candidate_fit_score.desc().nullslast(),
                Job.publication_date.desc().nullslast(),
            )
    else:
        query = query.filter(UserJob.status != "rejected")

    return query.order_by(
        applied_status_order.asc(),
        Job.publication_date.desc().nullslast(),
        UserJob.relevance_score.desc().nullslast(),
        UserJob.candidate_fit_score.desc().nullslast(),
        UserJob.updated_at.desc(),
        priority_order.desc(),
    )


def count_user_jobs(db: Session, user_id: int, statuses: Optional[list[str]] = None) -> int:
    return _build_user_jobs_query(db, user_id, statuses=statuses).count()


def get_user_jobs(
    db: Session,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    statuses: Optional[list[str]] = None,
) -> list[UserJob]:
    return _build_user_jobs_query(db, user_id, statuses=statuses).offset(offset).limit(limit).all()
