from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.database.models import CandidateAutofillProfile, CandidateProfile, User
from app.logging_utils import bind_log_context, log_event, timed_step
from app.services.autofill_service import (
    build_autofill_payload,
    parse_custom_answers,
    save_resume_file,
    serialize_autofill_settings,
)
from app.services.profile_extractor import extract_candidate_profile

router = APIRouter()
logger = logging.getLogger(__name__)


class AutofillSettingsPayload(BaseModel):
    phone: str = ""
    city: str = ""
    state: str = ""
    country: str = ""
    postal_code: str = ""
    linkedin_url: str = ""
    github_url: str = ""
    portfolio_url: str = ""
    website_url: str = ""
    pronouns: str = ""
    work_authorization: str = ""
    authorized_to_work_in_us: str = ""
    requires_sponsorship: Optional[bool] = None
    hispanic_or_latino: str = ""
    gender_identity: str = ""
    race_ethnicity: str = ""
    veteran_status: str = ""
    disability_status: str = ""
    custom_answers: dict[str, str] = Field(default_factory=dict)


def _serialize_profile(profile: CandidateProfile) -> dict:
    return {
        "profile_id": profile.id,
        "filename": profile.filename,
        "candidate_profile": json.loads(profile.profile_json),
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def _get_latest_profile_record(db: Session, user_id: int) -> Optional[CandidateProfile]:
    return (
        db.query(CandidateProfile)
        .filter(CandidateProfile.user_id == user_id)
        .order_by(CandidateProfile.updated_at.desc(), CandidateProfile.created_at.desc(), CandidateProfile.id.desc())
        .first()
    )


def _get_autofill_record(db: Session, user_id: int) -> Optional[CandidateAutofillProfile]:
    return (
        db.query(CandidateAutofillProfile)
        .filter(CandidateAutofillProfile.user_id == user_id)
        .first()
    )


@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services.resume_parser import extract_text_from_pdf_bytes

    bind_log_context(user_id=user.id)
    log_event(
        logger,
        "profile.upload_resume.started",
        filename=file.filename,
        content_type=file.content_type,
    )

    if file.content_type != "application/pdf":
        log_event(
            logger,
            "profile.upload_resume.rejected",
            level=logging.WARNING,
            filename=file.filename,
            content_type=file.content_type,
        )
        raise HTTPException(status_code=400, detail="Only PDF resumes are allowed.")

    contents = await file.read()

    with timed_step(logger, "profile.upload_resume.extract_text", filename=file.filename) as state:
        resume_text = extract_text_from_pdf_bytes(contents)
        state["resume_chars"] = len(resume_text)

    with timed_step(logger, "profile.upload_resume.extract_candidate_profile", filename=file.filename) as state:
        candidate_profile = await extract_candidate_profile(resume_text)
        state["target_roles"] = len(candidate_profile.get("target_roles", []))

    save_resume_file(user.id, contents)

    existing_profile = _get_latest_profile_record(db, user.id)

    if existing_profile:
        existing_profile.filename = file.filename or existing_profile.filename
        existing_profile.raw_resume_text = resume_text
        existing_profile.profile_json = json.dumps(candidate_profile)
        db.commit()
        db.refresh(existing_profile)
        log_event(logger, "profile.upload_resume.completed", profile_id=existing_profile.id, operation="updated")
        return {
            **_serialize_profile(existing_profile),
            "message": "Candidate profile updated successfully.",
        }

    profile_record = CandidateProfile(
        user_id=user.id,
        filename=file.filename or "resume.pdf",
        raw_resume_text=resume_text,
        profile_json=json.dumps(candidate_profile),
    )
    db.add(profile_record)
    db.commit()
    db.refresh(profile_record)
    log_event(logger, "profile.upload_resume.completed", profile_id=profile_record.id, operation="created")

    return {
        **_serialize_profile(profile_record),
        "message": "Candidate profile saved successfully.",
    }


@router.get("/me")
async def get_my_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile_record = _get_latest_profile_record(db, user.id)
    if profile_record is None:
        return JSONResponse(
            status_code=404,
            content={"error": "No candidate profile found. Please upload a resume first."},
        )

    return _serialize_profile(profile_record)


@router.get("/autofill-settings")
async def get_autofill_settings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return serialize_autofill_settings(_get_autofill_record(db, user.id))


@router.put("/autofill-settings")
async def upsert_autofill_settings(
    payload: AutofillSettingsPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = _get_autofill_record(db, user.id)
    if record is None:
        record = CandidateAutofillProfile(user_id=user.id)
        db.add(record)

    record.phone = payload.phone.strip() or None
    record.city = payload.city.strip() or None
    record.state = payload.state.strip() or None
    record.country = payload.country.strip() or None
    record.postal_code = payload.postal_code.strip() or None
    record.linkedin_url = payload.linkedin_url.strip() or None
    record.github_url = payload.github_url.strip() or None
    record.portfolio_url = payload.portfolio_url.strip() or None
    record.website_url = payload.website_url.strip() or None
    record.pronouns = payload.pronouns.strip() or None
    record.work_authorization = payload.work_authorization.strip() or None
    record.authorized_to_work_in_us = payload.authorized_to_work_in_us.strip() or None
    record.requires_sponsorship = payload.requires_sponsorship
    record.hispanic_or_latino = payload.hispanic_or_latino.strip() or None
    record.gender_identity = payload.gender_identity.strip() or None
    record.race_ethnicity = payload.race_ethnicity.strip() or None
    record.veteran_status = payload.veteran_status.strip() or None
    record.disability_status = payload.disability_status.strip() or None
    record.custom_answers_json = json.dumps(parse_custom_answers(json.dumps(payload.custom_answers)))

    db.commit()
    db.refresh(record)
    return serialize_autofill_settings(record)


@router.get("/autofill-payload")
async def get_autofill_payload(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile_record = _get_latest_profile_record(db, user.id)
    return build_autofill_payload(
        user=user,
        profile_record=profile_record,
        autofill_record=_get_autofill_record(db, user.id),
        base_url=str(request.base_url).rstrip("/"),
    )


@router.get("/resume-file")
async def download_resume_file(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services.autofill_service import get_resume_storage_path

    profile_record = _get_latest_profile_record(db, user.id)
    if profile_record is None:
        raise HTTPException(status_code=404, detail="No candidate profile found. Please upload a resume first.")

    resume_path = get_resume_storage_path(user.id)
    if not resume_path.exists():
        raise HTTPException(status_code=404, detail="Stored resume file not found. Upload the resume again.")

    return FileResponse(
        resume_path,
        media_type="application/pdf",
        filename=profile_record.filename or "resume.pdf",
    )
