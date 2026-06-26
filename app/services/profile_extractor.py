from __future__ import annotations

import json
import logging
import os
import re

from app.logging_utils import log_event
from app.services.llm_client import generate_json

logger = logging.getLogger(__name__)
MAX_PROFILE_PROMPT_CHARS = int(os.getenv("CHOPRON_MAX_PROFILE_PROMPT_CHARS", "8000"))

PROGRAMMING_LANGUAGES = [
    "python",
    "java",
    "javascript",
    "typescript",
    "sql",
    "pl/sql",
    "c#",
    "go",
    "ruby",
    "php",
]

FRAMEWORKS_TOOLS = [
    "pytorch",
    "tensorflow",
    "scikit-learn",
    "pandas",
    "numpy",
    "fastapi",
    "flask",
    "react",
    "node",
    "spring",
    ".net",
    "asp.net",
    "jquery",
    "ajax",
    "docker",
    "kubernetes",
    "airflow",
    "spark",
    "llm",
    "rag",
    "nlp",
    "computer vision",
    "sql developer",
    "toad",
    "jira",
    "git",
]

DATABASES = [
    "oracle database",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "sql server",
    "oracle 10g",
    "oracle 11g",
    "oracle 12c",
]

CLOUD_DEVOPS = [
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "mlops",
    "ci/cd",
]

ENTERPRISE_PLATFORMS = [
    "oracle apex",
    "oracle fusion",
    "oracle ebs",
    "oracle applications",
    "oracle integration cloud",
    "oic",
    "salesforce",
    "servicenow",
    "sap",
    "workday",
]

BUSINESS_FUNCTIONS = [
    "reporting",
    "dashboards",
    "forms",
    "workflow",
    "workflows",
    "integration",
    "integrations",
    "data ingestion",
    "data validation",
    "reconciliation",
    "enterprise applications",
    "production support",
    "uat",
    "authorization",
    "analytics",
]

DOMAIN_HINTS = [
    "healthcare",
    "clinical",
    "medical",
    "payer",
    "provider",
    "fintech",
    "finance",
    "financial",
    "insurance",
    "banking",
    "saas",
    "e-commerce",
    "retail",
    "enterprise",
    "ai",
    "machine learning",
    "data",
]

ROLE_HINTS = [
    "machine learning engineer",
    "ai engineer",
    "software engineer",
    "data scientist",
    "data engineer",
    "backend engineer",
    "full stack engineer",
    "ml engineer",
    "research engineer",
    "oracle apex developer",
    "oracle developer",
    "pl/sql developer",
    "application developer",
    "enterprise application developer",
    "business systems analyst",
    "integration developer",
    "consultant",
]


def _dedupe_strings(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        normalized = value.strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _extract_matches(text: str, options: list[str], limit: int) -> list[str]:
    lowered = text.lower()
    matches = [option for option in options if option.lower() in lowered]
    return _dedupe_strings(matches)[:limit]


def _extract_role_lines(text: str) -> list[str]:
    role_candidates: list[str] = []
    for line in text.splitlines():
        line_text = re.sub(r"\s+", " ", line).strip()
        if not line_text or len(line_text) > 100:
            continue
        lower_line = line_text.lower()
        if any(marker in lower_line for marker in ("skills", "tools", "process", "certified", "university", "summary", "education", "project", "portfolio", "linkedin", "github")):
            continue
        if any(keyword in lower_line for keyword in ("engineer", "developer", "analyst", "architect", "consultant", "administrator")):
            if re.search(r"\b(engineer|developer|analyst|architect|consultant|administrator)\b", lower_line):
                normalized = re.split(r"[|:]", line_text)[0].strip(" -")
                if "—" in normalized:
                    segments = [segment.strip() for segment in normalized.split("—") if segment.strip()]
                    normalized = segments[-1] if segments else normalized
                if normalized:
                    role_candidates.append(normalized)
    return _dedupe_strings(role_candidates)[:8]


def _extract_generic_skill_phrases(text: str) -> list[str]:
    phrases = re.findall(r"\b(?:[A-Z][A-Za-z0-9+#.&-]*|[A-Za-z0-9+#.&-]+/[A-Za-z0-9+#.&-]+)(?:\s+(?:[A-Z][A-Za-z0-9+#.&-]*|[A-Za-z0-9+#.&-]+/[A-Za-z0-9+#.&-]+)){0,2}\b", text)
    filtered: list[str] = []
    ignored = {"Florida", "LinkedIn", "GitHub", "Portfolio", "University", "Master", "Bachelor", "Oracle", "Sai Sankeerth Palakurthy"}
    for phrase in phrases:
        normalized = phrase.strip(" |,-")
        if len(normalized) < 3 or normalized in ignored:
            continue
        lower_normalized = normalized.lower()
        if any(token in lower_normalized for token in ("developer", "engineer", "analyst", "support")):
            continue
        if any(char.isdigit() for char in normalized) and not any(marker in lower_normalized for marker in ("oracle", "apex", ".net", "sql")):
            continue
        filtered.append(normalized)
    return _dedupe_strings(filtered)[:20]


def _extract_business_functions(text: str) -> list[str]:
    return _extract_matches(text, BUSINESS_FUNCTIONS, 10)


def _extract_education_lines(text: str) -> list[str]:
    candidates = []
    for line in text.splitlines():
        line_text = line.strip()
        lower_line = line_text.lower()
        if any(keyword in lower_line for keyword in ("b.s", "bs ", "bachelor", "m.s", "ms ", "master", "phd", "university", "college")):
            candidates.append(line_text)
    return _dedupe_strings(candidates)[:4]


def _extract_project_lines(text: str) -> list[str]:
    candidates = []
    for line in text.splitlines():
        line_text = line.strip()
        if 12 <= len(line_text) <= 120 and any(keyword in line_text.lower() for keyword in ("project", "built", "developed", "implemented", "deployed")):
            candidates.append(line_text)
    return _dedupe_strings(candidates)[:5]


def _infer_seniority(text: str) -> str:
    lowered = text.lower()
    years_match = re.search(r"(\d+)\+?\s+years? of", lowered)
    if years_match:
        years = int(years_match.group(1))
        if years >= 8:
            return "staff"
        if years >= 5:
            return "senior"
        if years <= 1:
            return "junior"
        return "mid"
    if any(keyword in lowered for keyword in ("staff", "principal", "lead ")):
        return "staff"
    if "senior" in lowered:
        return "senior"
    if any(keyword in lowered for keyword in ("junior", "entry level", "entry-level", "new grad", "intern")):
        return "junior"
    return "mid"


def _build_fallback_profile(resume_text: str) -> dict:
    roles = _extract_matches(resume_text, ROLE_HINTS, 6)
    role_lines = _extract_role_lines(resume_text)
    if role_lines:
        roles = _dedupe_strings([*roles, *role_lines])[:8]

    programming_languages = _extract_matches(resume_text, PROGRAMMING_LANGUAGES, 10)
    frameworks_tools = _extract_matches(resume_text, FRAMEWORKS_TOOLS, 15)
    databases = _extract_matches(resume_text, DATABASES, 8)
    cloud_devops = _extract_matches(resume_text, CLOUD_DEVOPS, 8)
    platforms = _extract_matches(resume_text, ENTERPRISE_PLATFORMS, 10)
    business_functions = _extract_business_functions(resume_text)
    domains = _extract_matches(resume_text, DOMAIN_HINTS, 8)
    generic_skill_phrases = _extract_generic_skill_phrases(resume_text)

    skills = _dedupe_strings([
        *platforms,
        *programming_languages,
        *frameworks_tools,
        *databases,
        *cloud_devops,
        *generic_skill_phrases,
    ])[:20]

    summary_lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    experience_summary = " ".join(summary_lines[:4])[:600]

    return {
        "target_roles": roles or ["Software Engineer"],
        "seniority": _infer_seniority(resume_text),
        "core_skills": skills,
        "platforms": platforms,
        "programming_languages": programming_languages,
        "frameworks_tools": frameworks_tools,
        "databases": databases,
        "cloud_devops": cloud_devops,
        "domains": domains,
        "business_functions": business_functions,
        "role_hints": role_lines[:6],
        "experience_summary": experience_summary,
        "education": _extract_education_lines(resume_text),
        "projects": _extract_project_lines(resume_text),
        "strong_keywords": skills[:12],
        "missing_or_weaker_skills": [],
    }


async def extract_candidate_profile(resume_text: str) -> dict:
    prompt_resume_text = resume_text[:MAX_PROFILE_PROMPT_CHARS]
    if len(resume_text) > MAX_PROFILE_PROMPT_CHARS:
        log_event(
            logger,
            "profile_extraction.resume_text_truncated",
            original_chars=len(resume_text),
            prompt_chars=len(prompt_resume_text),
        )

    prompt = f"""
You are an expert resume parser.

Extract a candidate profile from the resume text below.

Return ONLY valid JSON. No markdown. No explanation.

JSON schema:
{{
  "target_roles": [],
  "seniority": "",
  "core_skills": [],
  "platforms": [],
  "programming_languages": [],
  "frameworks_tools": [],
  "databases": [],
  "cloud_devops": [],
  "domains": [],
  "business_functions": [],
  "role_hints": [],
  "experience_summary": "",
  "education": [],
  "projects": [],
  "strong_keywords": [],
  "missing_or_weaker_skills": []
}}

Resume text:
\"\"\"
{prompt_resume_text}
\"\"\"
"""

    try:
        log_event(
            logger,
            "profile_extraction.llm_attempt_started",
            resume_chars=len(resume_text),
            prompt_chars=len(prompt_resume_text),
        )
        parsed = await generate_json(prompt)
        if isinstance(parsed, dict):
            fallback_profile = _build_fallback_profile(resume_text)
            merged = {**fallback_profile, **parsed}
            for key in ("target_roles", "core_skills", "platforms", "programming_languages", "frameworks_tools", "databases", "cloud_devops", "domains", "business_functions", "role_hints", "education", "projects", "strong_keywords", "missing_or_weaker_skills"):
                value = merged.get(key) or fallback_profile.get(key) or []
                merged[key] = _dedupe_strings([str(item) for item in value if str(item).strip()])
            merged["seniority"] = str(merged.get("seniority") or fallback_profile.get("seniority") or "mid")
            merged["experience_summary"] = str(merged.get("experience_summary") or fallback_profile.get("experience_summary") or "")[:600]
            log_event(logger, "profile_extraction.llm_attempt_succeeded", target_roles=len(merged.get("target_roles", [])))
            return merged
    except Exception as exc:
        log_event(
            logger,
            "profile_extraction.llm_attempt_fallback",
            level=logging.WARNING,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )

    log_event(logger, "profile_extraction.heuristic_fallback_used", resume_chars=len(resume_text))
    return _build_fallback_profile(resume_text)
