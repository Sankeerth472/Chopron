from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.database.models import User
from app.logging_utils import bind_log_context, log_event, timed_step
from app.services.job_service import (
    fetch_and_store_jobs,
    fetch_user_job_detail,
    fetch_user_jobs,
    has_candidate_profile,
    update_user_job_status,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class FetchJobsPayload(BaseModel):
    search: str = Field(default="machine learning engineer", min_length=1, max_length=200)
    limit: int = Field(default=10, ge=1, le=100)
    profile_id: Optional[int] = Field(default=None)


class UserJobStatusPayload(BaseModel):
    status: str = Field(min_length=1, max_length=20)


@router.post("/fetch")
async def fetch_jobs(
    payload: FetchJobsPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bind_log_context(user_id=user.id)
    log_event(logger, "jobs.fetch.started", profile_id=payload.profile_id, search=payload.search, limit=payload.limit)
    if not has_candidate_profile(db, user.id, payload.profile_id):
        log_event(logger, "jobs.fetch.rejected", level=logging.WARNING, reason="missing_profile", profile_id=payload.profile_id)
        return JSONResponse(
            status_code=404,
            content={"error": "No candidate profile found. Please upload a resume first."},
        )

    with timed_step(logger, "jobs.fetch.pipeline", profile_id=payload.profile_id, search=payload.search, limit=payload.limit) as state:
        result = await fetch_and_store_jobs(
            search=payload.search,
            limit=payload.limit,
            profile_id=payload.profile_id,
            db=db,
            user_id=user.id,
        )
        state["fetched_count"] = result.get("fetched_count")
        state["saved_count"] = result.get("saved_count")
        state["updated_count"] = result.get("updated_count")
        state["passed_count"] = result.get("passed_count")
    return result


@router.get("/me")
async def get_my_jobs(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return fetch_user_jobs(db, user.id, limit=limit, offset=offset)


@router.get("/saved")
async def get_saved_jobs(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return fetch_user_jobs(db, user.id, limit=limit, offset=offset, statuses=["saved"])


@router.get("/applied")
async def get_applied_jobs(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return fetch_user_jobs(db, user.id, limit=limit, offset=offset, statuses=["applied"])


@router.get("/{user_job_id}")
async def get_job_detail(
    user_job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = fetch_user_job_detail(db, user.id, user_job_id)
    if job is None:
        return JSONResponse(status_code=404, content={"error": "Job not found."})
    return job


@router.patch("/{user_job_id}/status")
async def set_job_status(
    user_job_id: int,
    payload: UserJobStatusPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        job = update_user_job_status(db, user.id, user_job_id, payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if job is None:
        return JSONResponse(status_code=404, content={"error": "Job not found."})

    return job
