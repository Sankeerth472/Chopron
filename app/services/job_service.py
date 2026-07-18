from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.config.role_family_config import DEFAULT_ROLE_FAMILY, ROLE_FAMILY_KEYWORDS
from app.database.models import CandidateProfile, Job, UserJob
from app.logging_utils import log_event
from app.repositories.job_repository import (
    count_user_jobs,
    get_global_job_by_identity,
    get_user_job_by_id,
    get_user_jobs,
)
from app.services.application_readiness_service import evaluate_application_readiness, heuristic_application_readiness
from app.services.candidate_fit_service import evaluate_candidate_fit, heuristic_candidate_fit
from app.services.job_normalizer import clean_html, normalize_job, to_job_record
from app.services.job_screener import screen_job
from app.services.job_sources.manager import fetch_jobs_for_queries as fetch_jobs_for_queries_from_sources

logger = logging.getLogger(__name__)
MAX_LLM_EVAL_JOBS = int(os.getenv("CHOPRON_MAX_LLM_EVAL_JOBS", "10"))
LLM_EVAL_CONCURRENCY = int(os.getenv("CHOPRON_LLM_EVAL_CONCURRENCY", "2"))
USER_JOB_STATUSES = {"fetched", "saved", "applied", "rejected"}
MAX_GENERATED_QUERIES = int(os.getenv("CHOPRON_MAX_GENERATED_QUERIES", "10"))


def _parse_json_text(value: Optional[str], default):
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _serialize_user_job(user_job: UserJob) -> dict:
    job = user_job.job
    return {
        "id": user_job.id,
        "job_id": job.id,
        "status": user_job.status,
        "match_score": user_job.match_score,
        "match_reason": user_job.match_reason or "",
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "remote": bool(job.remote),
        "source": job.source,
        "url": job.url,
        "description": clean_html(job.description),
        "publication_date": job.publication_date,
        "relevance_score": max(0, min(int(user_job.relevance_score or 0), 100)),
        "apply_priority": user_job.apply_priority or "",
        "candidate_fit_score": max(0, min(int(user_job.candidate_fit_score or 0), 100)) if user_job.candidate_fit_score is not None else None,
        "apply_recommendation": user_job.apply_recommendation or "REVIEW",
        "applied_at": user_job.applied_at.isoformat() if user_job.applied_at else None,
        "created_at": user_job.created_at.isoformat() if user_job.created_at else None,
        "updated_at": user_job.updated_at.isoformat() if user_job.updated_at else None,
    }


def _serialize_user_job_detail(user_job: UserJob) -> dict:
    return {
        **_serialize_user_job(user_job),
        "screening_status": user_job.screening_status or "",
        "screening_reason": user_job.screening_reason or "",
        "fit_summary": user_job.fit_summary or "",
        "strengths": _parse_json_text(user_job.strengths, []),
        "gaps": _parse_json_text(user_job.gaps, []),
        "resume_keywords_to_add": _parse_json_text(user_job.resume_keywords_to_add, []),
        "resume_angle": user_job.resume_angle or "",
        "cover_letter_angle": user_job.cover_letter_angle or "",
        "interview_prep_topics": _parse_json_text(user_job.interview_prep_topics, []),
    }


def _default_fit_payload() -> dict:
    return {
        "candidate_fit_score": None,
        "fit_summary": "",
        "strengths": [],
        "gaps": [],
        "apply_recommendation": "REVIEW",
        "resume_keywords_to_add": [],
        "resume_angle": "",
        "cover_letter_angle": "",
        "interview_prep_topics": [],
    }


async def _enrich_job_with_candidate_fit(candidate_profile: Optional[dict], job: dict) -> dict:
    if not candidate_profile:
        return {
            **job,
            **_default_fit_payload(),
        }

    heuristic_fit_result = heuristic_candidate_fit(candidate_profile or {}, job)
    heuristic_readiness_result = heuristic_application_readiness(candidate_profile or {}, job, heuristic_fit_result)

    if int(job.get("relevance_score") or 0) < 70:
        return {
            **job,
            **heuristic_fit_result,
            **heuristic_readiness_result,
        }

    try:
        fit_result = await evaluate_candidate_fit(candidate_profile, job)
        if fit_result.get("apply_recommendation") in {"APPLY", "MAYBE"}:
            readiness_result = await evaluate_application_readiness(candidate_profile, job, fit_result)
        else:
            readiness_result = heuristic_application_readiness(candidate_profile, job, fit_result)

        return {
            **job,
            **fit_result,
            **readiness_result,
        }
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning(
            "Candidate fit evaluation failed for title=%s company=%s: %s",
            job.get("title"),
            job.get("company"),
            exc,
        )
        return {
            **job,
            **heuristic_fit_result,
            **heuristic_readiness_result,
        }


async def _enrich_jobs_with_candidate_fit(candidate_profile: Optional[dict], jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []

    llm_eligible_jobs: list[dict] = []
    passthrough_jobs: list[dict] = []

    for index, job in enumerate(jobs):
        if candidate_profile and int(job.get("relevance_score") or 0) >= 70 and len(llm_eligible_jobs) < MAX_LLM_EVAL_JOBS:
            llm_eligible_jobs.append({**job, "_original_index": index})
        else:
            heuristic_fit_result = heuristic_candidate_fit(candidate_profile or {}, job) if candidate_profile else _default_fit_payload()
            heuristic_readiness_result = (
                heuristic_application_readiness(candidate_profile or {}, job, heuristic_fit_result)
                if candidate_profile
                else {
                    "resume_keywords_to_add": [],
                    "resume_angle": "",
                    "cover_letter_angle": "",
                    "interview_prep_topics": [],
                }
            )
            passthrough_jobs.append({
                **job,
                **heuristic_fit_result,
                **heuristic_readiness_result,
                "_original_index": index,
            })

    semaphore = asyncio.Semaphore(max(1, LLM_EVAL_CONCURRENCY))

    async def enrich_with_limit(job: dict) -> dict:
        async with semaphore:
            enriched = await _enrich_job_with_candidate_fit(candidate_profile, job)
            return {
                **enriched,
                "_original_index": job["_original_index"],
            }

    enriched_llm_jobs = await asyncio.gather(*(enrich_with_limit(job) for job in llm_eligible_jobs))
    combined_jobs = enriched_llm_jobs + passthrough_jobs
    combined_jobs.sort(key=lambda job: job["_original_index"])
    return [{key: value for key, value in job.items() if key != "_original_index"} for job in combined_jobs]


def _dedupe_source_wrapped_jobs(source_wrapped_jobs: list[dict]) -> list[dict]:
    deduped_jobs: list[dict] = []
    seen_keys: set[tuple[str, str, str, str]] = set()

    for wrapped_job in source_wrapped_jobs:
        raw_job = wrapped_job.get("raw_job") or {}
        raw_id = str(raw_job.get("id") or raw_job.get("internal_job_id") or "").strip()
        raw_url = str(
            raw_job.get("url")
            or raw_job.get("absolute_url")
            or raw_job.get("hostedUrl")
            or raw_job.get("jobUrl")
            or raw_job.get("applyUrl")
            or ""
        ).strip()
        key = (
            wrapped_job.get("source") or "",
            wrapped_job.get("company_slug") or "",
            raw_id,
            raw_url,
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped_jobs.append(wrapped_job)

    return deduped_jobs


def _dedupe_normalized_jobs(normalized_jobs: list[dict]) -> list[dict]:
    deduped_jobs: list[dict] = []
    seen_job_urls: set[str] = set()
    seen_secondary_keys: set[tuple[str, str, str]] = set()

    for job in normalized_jobs:
        job_url = (job.get("url") or "").strip().lower()
        if job_url:
            if job_url in seen_job_urls:
                continue
            seen_job_urls.add(job_url)

        secondary_key = (
            (job.get("source") or "").strip().lower(),
            (job.get("company") or "").strip().lower(),
            (job.get("title") or "").strip().lower(),
        )
        if secondary_key in seen_secondary_keys:
            continue

        seen_secondary_keys.add(secondary_key)
        deduped_jobs.append(job)

    return deduped_jobs


def _load_candidate_profile_record(db: Session, user_id: int, profile_id: Optional[int]) -> Optional[CandidateProfile]:
    query = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id)
    if profile_id is not None:
        return query.filter(CandidateProfile.id == profile_id).first()
    return query.order_by(CandidateProfile.updated_at.desc(), CandidateProfile.created_at.desc(), CandidateProfile.id.desc()).first()


def _load_candidate_profile(db: Session, user_id: int, profile_id: Optional[int]) -> Optional[dict]:
    record = _load_candidate_profile_record(db, user_id, profile_id)
    if not record:
        return None
    return json.loads(record.profile_json)


def has_candidate_profile(db: Session, user_id: int, profile_id: Optional[int] = None) -> bool:
    return _load_candidate_profile_record(db, user_id, profile_id) is not None


def _generate_queries_from_profile(candidate_profile: Optional[dict], fallback_search: str) -> list[str]:
    if not candidate_profile:
        return [fallback_search]

    target_roles = candidate_profile.get("target_roles") or []
    skills = candidate_profile.get("core_skills") or []
    platforms = candidate_profile.get("platforms") or []
    programming_languages = candidate_profile.get("programming_languages") or []
    frameworks_tools = candidate_profile.get("frameworks_tools") or []
    domains = candidate_profile.get("domains") or []
    business_functions = candidate_profile.get("business_functions") or []
    role_hints = candidate_profile.get("role_hints") or []

    queries: list[str] = []
    for role in [*target_roles, *role_hints]:
        normalized_role = str(role).strip()
        if not normalized_role:
            continue
        queries.append(normalized_role)
        family = ROLE_FAMILY_KEYWORDS.get(normalized_role.lower())
        if family:
            queries.extend(family)

    if not queries:
        queries.extend(DEFAULT_ROLE_FAMILY)

    for platform in platforms[:5]:
        platform_text = str(platform).strip()
        if platform_text:
            queries.append(platform_text)
            for role in target_roles[:3] or DEFAULT_ROLE_FAMILY[:2]:
                queries.append(f"{platform_text} {role}")

    for skill in skills[:6]:
        skill_text = str(skill).strip()
        if skill_text and skill_text.lower() in {
            "machine learning", "llm", "nlp", "computer vision", "mlops",
            "python", "java", "c#", ".net", "spring", "react", "typescript", "fastapi", "pl/sql", "oracle apex", "oracle fusion",
        }:
            queries.append(skill_text)

    for domain in domains[:3]:
        domain_text = str(domain).strip()
        if domain_text:
            queries.append(domain_text)

    top_role_queries = [query for query in queries[:6] if query]
    for domain in domains[:3]:
        domain_text = str(domain).strip()
        if not domain_text:
            continue
        for role in top_role_queries[:4]:
            queries.append(f"{domain_text} {role}")

    for language in programming_languages[:3]:
        language_text = str(language).strip()
        if language_text:
            queries.append(f"{language_text} software engineer")

    for tool in frameworks_tools[:3]:
        tool_text = str(tool).strip()
        if tool_text.lower() in {"spring", ".net", "fastapi", "react", "pytorch", "tensorflow", "sql developer", "toad"}:
            queries.append(f"{tool_text} engineer")

    for function in business_functions[:4]:
        function_text = str(function).strip()
        if not function_text:
            continue
        for role in target_roles[:2]:
            queries.append(f"{function_text} {role}")
        for platform in platforms[:2]:
            queries.append(f"{platform} {function_text}")

    unique_queries: list[str] = []
    seen_queries: set[str] = set()
    for query in queries:
        normalized_query = query.strip()
        query_key = normalized_query.lower()
        if not normalized_query or query_key in seen_queries:
            continue
        seen_queries.add(query_key)
        unique_queries.append(normalized_query)

    trimmed_queries = unique_queries[: max(1, MAX_GENERATED_QUERIES)]
    return trimmed_queries or [fallback_search]


async def _fetch_jobs_for_queries(queries: list[str], limit: int) -> dict:
    result = await fetch_jobs_for_queries_from_sources(queries, limit)
    deduped_jobs = _dedupe_source_wrapped_jobs(result.get("jobs", []))
    result["jobs"] = deduped_jobs

    source_counts: dict[str, int] = {}
    for job in deduped_jobs:
        source_name = job.get("source") or "unknown"
        source_counts[source_name] = source_counts.get(source_name, 0) + 1

    for source_name, diagnostics in result.get("diagnostics", {}).items():
        diagnostics["raw_jobs_fetched"] = diagnostics.get("jobs_fetched", 0)
        diagnostics["jobs_fetched"] = source_counts.get(source_name, 0)

    return result


def _apply_user_job_analysis(user_job: UserJob, enriched_job: dict) -> None:
    user_job.match_score = enriched_job.get("candidate_fit_score")
    user_job.match_reason = enriched_job.get("fit_summary") or enriched_job.get("screening_reason") or ""
    user_job.screening_status = enriched_job.get("screening_status") or ""
    user_job.screening_reason = enriched_job.get("screening_reason") or ""
    user_job.relevance_score = max(0, min(int(enriched_job.get("relevance_score") or 0), 100))
    user_job.apply_priority = enriched_job.get("apply_priority") or ""
    user_job.candidate_fit_score = max(0, min(int(enriched_job.get("candidate_fit_score") or 0), 100)) if enriched_job.get("candidate_fit_score") is not None else None
    user_job.fit_summary = enriched_job.get("fit_summary") or ""
    user_job.strengths = json.dumps(enriched_job.get("strengths", []))
    user_job.gaps = json.dumps(enriched_job.get("gaps", []))
    user_job.apply_recommendation = enriched_job.get("apply_recommendation") or "REVIEW"
    user_job.resume_keywords_to_add = json.dumps(enriched_job.get("resume_keywords_to_add", []))
    user_job.resume_angle = enriched_job.get("resume_angle") or ""
    user_job.cover_letter_angle = enriched_job.get("cover_letter_angle") or ""
    user_job.interview_prep_topics = json.dumps(enriched_job.get("interview_prep_topics", []))


def _upsert_global_job(db: Session, normalized_job: dict) -> Job:
    job_data = to_job_record(normalized_job)
    existing_job = get_global_job_by_identity(
        db,
        source=job_data["source"],
        external_id=job_data["external_id"],
        url=job_data["url"],
    )

    if existing_job:
        existing_job.source = job_data["source"]
        existing_job.external_id = job_data["external_id"]
        existing_job.title = job_data["title"]
        existing_job.company = job_data["company"]
        existing_job.location = job_data["location"]
        existing_job.remote = job_data["remote"]
        existing_job.url = job_data["url"]
        existing_job.description = job_data["description"]
        existing_job.publication_date = job_data["publication_date"]
        existing_job.raw_json = job_data["raw_json"]
        return existing_job

    job = Job(**job_data)
    db.add(job)
    db.flush()
    return job


async def fetch_and_store_jobs(
    search: str,
    limit: int,
    db: Session,
    user_id: int,
    profile_id: Optional[int] = None,
):
    log_event(logger, "jobs.pipeline.load_profile.started", profile_id=profile_id, search=search, limit=limit)
    candidate_profile = _load_candidate_profile(db, user_id, profile_id)
    log_event(logger, "jobs.pipeline.load_profile.succeeded", has_profile=bool(candidate_profile))

    queries = _generate_queries_from_profile(candidate_profile, search)
    log_event(logger, "jobs.pipeline.generate_queries.succeeded", query_count=len(queries), queries=queries[:10])

    fetch_result = await _fetch_jobs_for_queries(queries, limit)
    source_wrapped_jobs = fetch_result["jobs"]
    source_diagnostics = fetch_result["diagnostics"]
    log_event(logger, "jobs.pipeline.fetch_sources.succeeded", fetched_count=len(source_wrapped_jobs), source_statistics=source_diagnostics)

    normalized_jobs = [
        normalize_job(
            source=job["source"],
            raw_job=job["raw_job"],
            company_slug=job.get("company_slug"),
        )
        for job in source_wrapped_jobs
    ]
    log_event(logger, "jobs.pipeline.normalize_jobs.succeeded", normalized_count=len(normalized_jobs))
    deduped_jobs = _dedupe_normalized_jobs(normalized_jobs)
    log_event(logger, "jobs.pipeline.dedupe_jobs.succeeded", deduplicated_count=len(deduped_jobs))

    screened_jobs = []
    passed_jobs = []
    rejected_count = 0

    for job in deduped_jobs:
        screening = screen_job(job, candidate_profile)
        screened_job = {
            **job,
            **screening,
        }
        screened_jobs.append(screened_job)
        if screening["screening_status"] == "PASSED":
            passed_jobs.append(screened_job)
        else:
            rejected_count += 1
    log_event(
        logger,
        "jobs.pipeline.screen_jobs.succeeded",
        screened_count=len(screened_jobs),
        passed_count=len(passed_jobs),
        rejected_count=rejected_count,
    )

    enriched_jobs = await _enrich_jobs_with_candidate_fit(candidate_profile, passed_jobs)
    log_event(logger, "jobs.pipeline.enrich_jobs.succeeded", enriched_count=len(enriched_jobs))
    enriched_jobs.sort(
        key=lambda job: (
            job.get("relevance_score", 0),
            job.get("candidate_fit_score") if job.get("candidate_fit_score") is not None else -1,
        ),
        reverse=True,
    )

    saved_jobs = []
    updated_jobs = []
    persisted_user_jobs: list[UserJob] = []

    for enriched_job in enriched_jobs:
        global_job = _upsert_global_job(db, enriched_job)
        existing_user_job = (
            db.query(UserJob)
            .filter(UserJob.user_id == user_id, UserJob.job_id == global_job.id)
            .first()
        )

        if existing_user_job:
            _apply_user_job_analysis(existing_user_job, enriched_job)
            updated_jobs.append(existing_user_job)
            persisted_user_jobs.append(existing_user_job)
            continue

        user_job = UserJob(
            user_id=user_id,
            job_id=global_job.id,
            status="fetched",
        )
        _apply_user_job_analysis(user_job, enriched_job)
        db.add(user_job)
        saved_jobs.append(user_job)
        persisted_user_jobs.append(user_job)

    db.commit()
    log_event(logger, "jobs.pipeline.persist_jobs.succeeded", saved_count=len(saved_jobs), updated_count=len(updated_jobs))

    refreshed_user_jobs = [
        get_user_job_by_id(db, user_job.id, user_id)
        for user_job in persisted_user_jobs
    ]
    refreshed_user_jobs = [user_job for user_job in refreshed_user_jobs if user_job is not None]

    return {
        "search": search,
        "profile_used": profile_id,
        "generated_queries": queries,
        "fetched_count": len(source_wrapped_jobs),
        "normalized_count": len(normalized_jobs),
        "deduplicated_count": len(deduped_jobs),
        "screened_count": len(screened_jobs),
        "passed_count": len(enriched_jobs),
        "rejected_count": rejected_count,
        "updated_count": len(updated_jobs),
        "saved_count": len(saved_jobs),
        "source_statistics": source_diagnostics,
        "jobs": [_serialize_user_job(user_job) for user_job in refreshed_user_jobs],
    }


def fetch_user_jobs(db: Session, user_id: int, limit: int = 20, offset: int = 0, statuses: Optional[list[str]] = None):
    jobs = get_user_jobs(db, user_id, limit, offset=offset, statuses=statuses)
    total_count = count_user_jobs(db, user_id, statuses=statuses)
    return {
        "count": len(jobs),
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(jobs) < total_count,
        "jobs": [_serialize_user_job(job) for job in jobs],
    }


def fetch_user_job_detail(db: Session, user_id: int, user_job_id: int):
    user_job = get_user_job_by_id(db, user_job_id, user_id)
    if not user_job:
        return None
    return _serialize_user_job_detail(user_job)


def update_user_job_status(db: Session, user_id: int, user_job_id: int, status: str):
    normalized_status = status.strip().lower()
    if normalized_status not in USER_JOB_STATUSES:
        raise ValueError(f"Unsupported job status: {status}")

    user_job = get_user_job_by_id(db, user_job_id, user_id)
    if not user_job:
        return None

    user_job.status = normalized_status
    user_job.applied_at = datetime.now(timezone.utc) if normalized_status == "applied" else None
    db.commit()
    refreshed = get_user_job_by_id(db, user_job_id, user_id)
    return _serialize_user_job(refreshed) if refreshed else None
