from __future__ import annotations

import json
import re

from app.services.llm_client import generate_json


def _compact_candidate_profile(candidate_profile: dict) -> dict:
    return {
        "target_roles": candidate_profile.get("target_roles", [])[:5],
        "core_skills": candidate_profile.get("core_skills", [])[:15],
        "programming_languages": candidate_profile.get("programming_languages", [])[:10],
        "frameworks_tools": candidate_profile.get("frameworks_tools", [])[:15],
        "cloud_devops": candidate_profile.get("cloud_devops", [])[:10],
        "domains": candidate_profile.get("domains", [])[:8],
        "experience_summary": candidate_profile.get("experience_summary", "")[:600],
    }


def _compact_job(job: dict) -> dict:
    return {
        "title": job.get("title"),
        "company": job.get("company"),
        "location": job.get("location"),
        "description_excerpt": (job.get("description") or "")[:1800],
    }


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").lower()).strip()


def heuristic_application_readiness(candidate_profile: dict, job: dict, candidate_fit_result: dict) -> dict:
    description = _normalize_text(job.get("description"))
    resume_keywords_to_add: list[str] = []

    candidate_terms = []
    for key in ("core_skills", "programming_languages", "frameworks_tools", "cloud_devops", "strong_keywords"):
        candidate_terms.extend(str(value) for value in (candidate_profile.get(key, []) or []))

    suggested_keywords = [
        "python",
        "pytorch",
        "tensorflow",
        "rag",
        "llm",
        "mlops",
        "aws",
        "apis",
        "machine learning",
    ]
    for keyword in suggested_keywords:
        if keyword in description and all(keyword not in str(term).lower() for term in candidate_terms):
            resume_keywords_to_add.append(keyword)

    title = job.get("title") or ""
    company = job.get("company") or ""
    resume_angle = f"Position yourself as a strong match for {title} at {company}."
    cover_letter_angle = f"Highlight relevant impact, domain overlap, and applied ML results for {company}."
    interview_prep_topics = [keyword for keyword in ["machine learning", "llm", "rag", "mlops", "python", "apis"] if keyword in description][:5]

    return {
        "resume_keywords_to_add": resume_keywords_to_add[:8],
        "resume_angle": resume_angle,
        "cover_letter_angle": cover_letter_angle,
        "interview_prep_topics": interview_prep_topics,
    }


def _build_application_readiness_prompt(candidate_profile: dict, job: dict, candidate_fit_result: dict) -> str:
    compact_profile = _compact_candidate_profile(candidate_profile)
    compact_job = _compact_job(job)
    return f"""
You are preparing a candidate to apply to a specific job.

Return ONLY valid JSON. No markdown. No explanation.

JSON schema:
{{
  "resume_keywords_to_add": [],
  "resume_angle": "",
  "cover_letter_angle": "",
  "interview_prep_topics": []
}}

Candidate profile JSON:
{json.dumps(compact_profile, ensure_ascii=True)}

Job:
{json.dumps(compact_job, ensure_ascii=True)}

Candidate fit result:
{json.dumps(candidate_fit_result, ensure_ascii=True)}
"""


async def evaluate_application_readiness(candidate_profile: dict, job: dict, candidate_fit_result: dict) -> dict:
    prompt = _build_application_readiness_prompt(candidate_profile, job, candidate_fit_result)
    result = await generate_json(prompt)

    return {
        "resume_keywords_to_add": result.get("resume_keywords_to_add", []) or [],
        "resume_angle": result.get("resume_angle", "") or "",
        "cover_letter_angle": result.get("cover_letter_angle", "") or "",
        "interview_prep_topics": result.get("interview_prep_topics", []) or [],
    }
