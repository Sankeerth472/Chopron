from __future__ import annotations

import json
import re

from app.services.llm_client import generate_json


def _compact_candidate_profile(candidate_profile: dict) -> dict:
    return {
        "target_roles": candidate_profile.get("target_roles", [])[:5],
        "seniority": candidate_profile.get("seniority", ""),
        "core_skills": candidate_profile.get("core_skills", [])[:15],
        "programming_languages": candidate_profile.get("programming_languages", [])[:10],
        "frameworks_tools": candidate_profile.get("frameworks_tools", [])[:15],
        "cloud_devops": candidate_profile.get("cloud_devops", [])[:10],
        "domains": candidate_profile.get("domains", [])[:8],
        "strong_keywords": candidate_profile.get("strong_keywords", [])[:20],
        "experience_summary": candidate_profile.get("experience_summary", "")[:600],
    }


def _compact_job(job: dict) -> dict:
    return {
        "title": job.get("title"),
        "company": job.get("company"),
        "location": job.get("location"),
        "relevance_score": job.get("relevance_score", 0),
        "description_excerpt": (job.get("description") or "")[:2500],
    }


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").lower()).strip()


def _extract_profile_terms(candidate_profile: dict) -> list[str]:
    terms: list[str] = []
    for key in (
        "target_roles",
        "core_skills",
        "programming_languages",
        "frameworks_tools",
        "cloud_devops",
        "domains",
        "strong_keywords",
    ):
        for value in candidate_profile.get(key, []) or []:
            value_text = str(value).strip()
            if value_text:
                terms.append(value_text.lower())
    return terms


def heuristic_candidate_fit(candidate_profile: dict, job: dict) -> dict:
    title = _normalize_text(job.get("title"))
    description = _normalize_text(job.get("description"))
    haystack = f"{title} {description}"

    target_roles = [str(role).lower() for role in candidate_profile.get("target_roles", []) or []]
    profile_terms = _extract_profile_terms(candidate_profile)
    domains = [str(domain).lower() for domain in candidate_profile.get("domains", []) or []]

    strengths: list[str] = []
    gaps: list[str] = []
    score = 35

    if any(role and role in title for role in target_roles):
        score += 20
        strengths.append("target role alignment")

    matched_terms = [term for term in profile_terms if term and term in haystack]
    if matched_terms:
        score += min(len(set(matched_terms)) * 4, 30)
        strengths.append(f"matching skills/tools: {', '.join(sorted(set(matched_terms))[:4])}")
    else:
        gaps.append("few explicit profile skill matches")

    domain_keywords = {
        "healthcare": ["healthcare", "clinical", "patient", "medical", "health"],
        "fintech": ["fintech", "payments", "underwriting", "banking", "risk", "finance"],
    }
    matched_domain = False
    for domain in domains:
        keywords = domain_keywords.get(domain, [domain])
        if any(keyword in haystack for keyword in keywords):
            score += 10
            strengths.append(f"domain relevance: {domain}")
            matched_domain = True
            break
    if domains and not matched_domain:
        score -= 10
        gaps.append("domain mismatch")

    seniority = _normalize_text(candidate_profile.get("seniority"))
    if "senior" in title and seniority and "senior" not in seniority:
        score -= 8
        gaps.append("possible seniority mismatch")

    score = max(0, min(score, 100))
    if score >= 80:
        apply_recommendation = "APPLY"
    elif score >= 60:
        apply_recommendation = "MAYBE"
    else:
        apply_recommendation = "SKIP"

    fit_summary = "Strong overall fit." if apply_recommendation == "APPLY" else "Partial fit with some gaps." if apply_recommendation == "MAYBE" else "Weak fit."

    return {
        "candidate_fit_score": score,
        "fit_summary": fit_summary,
        "strengths": strengths[:5],
        "gaps": gaps[:5],
        "apply_recommendation": apply_recommendation,
    }


def _build_candidate_fit_prompt(candidate_profile: dict, job: dict) -> str:
    compact_profile = _compact_candidate_profile(candidate_profile)
    compact_job = _compact_job(job)
    return f"""
You are evaluating whether a job is a strong fit for a candidate.

Return ONLY valid JSON. No markdown. No explanation.

Rules:
- Score candidate_fit_score from 0 to 100.
- Penalize seniority or experience mismatch.
- Penalize missing domain expertise.
- Reward matching skills, tools, ML/LLM/MLOps experience, cloud, APIs, and healthcare/fintech relevance.
- apply_recommendation must be one of: APPLY, MAYBE, SKIP

JSON schema:
{{
  "candidate_fit_score": 0,
  "fit_summary": "",
  "strengths": [],
  "gaps": [],
  "apply_recommendation": "APPLY"
}}

Candidate profile JSON:
{json.dumps(compact_profile, ensure_ascii=True)}

Job:
{json.dumps(compact_job, ensure_ascii=True)}
"""


async def evaluate_candidate_fit(candidate_profile: dict, job: dict) -> dict:
    prompt = _build_candidate_fit_prompt(candidate_profile, job)
    result = await generate_json(prompt)

    return {
        "candidate_fit_score": max(0, min(int(result.get("candidate_fit_score", 0)), 100)),
        "fit_summary": result.get("fit_summary", "") or "",
        "strengths": result.get("strengths", []) or [],
        "gaps": result.get("gaps", []) or [],
        "apply_recommendation": result.get("apply_recommendation", "REVIEW") or "REVIEW",
    }
