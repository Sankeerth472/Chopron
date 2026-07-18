from __future__ import annotations

import re
from typing import Optional

from app.config.role_family_config import DEFAULT_ROLE_FAMILY, ROLE_FAMILY_KEYWORDS

ALLOWED_LOCATION_TERMS = {
    "united states",
    "usa",
    "us",
    "u.s.",
    "remote us",
    "remote usa",
    "remote united states",
    "united states remote",
    "us remote",
    "remote-usa",
}

US_STATE_CODES = {
    "al", "ak", "az", "ar", "ca", "co", "ct", "dc", "de", "fl", "ga", "hi", "ia",
    "id", "il", "in", "ks", "ky", "la", "ma", "md", "me", "mi", "mn", "mo", "ms",
    "mt", "nc", "nd", "ne", "nh", "nj", "nm", "nv", "ny", "oh", "ok", "or", "pa",
    "ri", "sc", "sd", "tn", "tx", "ut", "va", "vt", "wa", "wi", "wv", "wy",
}

REJECTED_LOCATION_TERMS = {
    "india",
    "hyderabad",
    "bangalore",
    "amsterdam",
    "netherlands",
    "uk",
    "united kingdom",
    "europe",
    "germany",
    "poland",
    "singapore",
    "canada",
}

REJECTED_SENIORITY_TERMS = [
    "vp",
    "vice president",
]

REJECTED_INTERN_TERMS = [
    "intern",
    "internship",
    "phd intern",
    "graduate intern",
]

MIN_RELEVANCE_SCORE = 30
STRICT_PROFILE_MIN_RELEVANCE_SCORE = 45

REJECTED_ROLE_TERMS = [
    "account executive",
    "account manager",
    "client partner",
    "customer success",
    "sales",
    "salesforce",
    "business development",
    "partnerships",
    "recruiter",
    "talent",
    "marketing",
    "brand strategist",
    "creative strategist",
    "creative technologist",
    "copywriter",
    "designer",
    "product designer",
]

DOMAIN_KEYWORD_SYNONYMS = {
    "healthcare": ["healthcare", "clinical", "patient", "medical", "health", "payer", "provider"],
    "fintech": ["fintech", "payments", "banking", "risk", "finance", "underwriting"],
    "finance": ["finance", "financial", "banking", "investment", "capital markets"],
    "saas": ["saas", "b2b", "enterprise software", "workflow automation"],
    "e-commerce": ["e-commerce", "retail", "marketplace", "commerce"],
    "ai": ["ai", "artificial intelligence", "machine learning", "llm"],
    "machine learning": ["machine learning", "ml", "model training", "deep learning"],
    "data": ["data", "etl", "analytics", "data platform"],
}

ROLE_SIGNAL_KEYWORDS = {
    "machine learning engineer": ["machine learning engineer", "ml engineer", "applied ai engineer", "ai engineer"],
    "ai engineer": ["ai engineer", "applied ai engineer", "llm engineer", "generative ai engineer"],
    "data scientist": ["data scientist", "applied scientist", "research scientist"],
    "software engineer": ["software engineer", "software developer", "application engineer"],
    "backend engineer": ["backend engineer", "backend developer", "api engineer", "platform engineer"],
    "full stack engineer": ["full stack engineer", "full stack developer", "software engineer"],
    "data engineer": ["data engineer", "analytics engineer", "data platform engineer", "ml platform engineer"],
}

ROLE_FAMILY_INFERENCE_KEYWORDS = {
    "ai/ml engineer": {"machine learning", "mlops", "llm", "nlp", "computer vision", "pytorch", "tensorflow", "scikit-learn"},
    "software engineer": {"c#", ".net", "java", "spring", "microservices", "rest api", "backend", "software engineering"},
    "backend engineer": {"java", "spring", "c#", ".net", "apis", "api", "microservices", "sql", "backend"},
    "data engineer": {"spark", "airflow", "data pipeline", "etl", "warehouse", "dbt", "analytics"},
}


def _normalize_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").lower()).strip()


def _location_passes(location: Optional[str]) -> tuple[bool, str]:
    normalized = _normalize_text(location)
    if not normalized:
        return True, "Missing location"

    if any(term in normalized for term in REJECTED_LOCATION_TERMS):
        return False, "Non-US location"

    if "remote" in normalized and any(token in normalized for token in ("us", "usa", "united states", "u.s.")):
        return True, "US remote location"

    if any(term in normalized for term in ALLOWED_LOCATION_TERMS):
        return True, "US location"

    location_tokens = re.findall(r"[a-z]+", normalized)
    if any(token in US_STATE_CODES for token in location_tokens):
        return True, "US state location"

    return True, "Location needs manual review"


def _internship_passes(title: Optional[str]) -> tuple[bool, str]:
    normalized_title = _normalize_text(title)
    for term in REJECTED_INTERN_TERMS:
        if term in normalized_title:
            return False, "Intern role"
    return True, "Full-time role"


def _seniority_passes(title: Optional[str]) -> tuple[bool, str]:
    normalized_title = _normalize_text(title)
    for term in REJECTED_SENIORITY_TERMS:
        if term in normalized_title:
            return False, "Seniority too high"
    return True, "Seniority acceptable"


def _role_family_passes(title: Optional[str], description: Optional[str]) -> tuple[bool, str]:
    normalized_title = _normalize_text(title)
    for term in REJECTED_ROLE_TERMS:
        if term in normalized_title:
            return False, f"Off-profile role family: {term}"
    return True, "Role family acceptable"


def get_apply_priority(relevance_score: int) -> str:
    if relevance_score >= 90:
        return "HIGH"
    if relevance_score >= 70:
        return "MEDIUM"
    if relevance_score >= 50:
        return "LOW"
    return ""


def _extract_profile_terms(candidate_profile: Optional[dict]) -> tuple[list[str], list[str], list[str]]:
    if not candidate_profile:
        return [], [], []

    target_roles = [str(role).strip().lower() for role in ([*(candidate_profile.get("target_roles") or []), *(candidate_profile.get("role_hints") or [])]) if str(role).strip()]
    domains = [str(domain).strip().lower() for domain in (candidate_profile.get("domains") or []) if str(domain).strip()]
    skills: list[str] = []
    for key in ("core_skills", "platforms", "programming_languages", "frameworks_tools", "cloud_devops", "business_functions", "strong_keywords"):
        for value in candidate_profile.get(key, []) or []:
            skill = str(value).strip().lower()
            if skill:
                skills.append(skill)

    deduped_skills: list[str] = []
    seen_skills: set[str] = set()
    for skill in skills:
        if skill in seen_skills:
            continue
        seen_skills.add(skill)
        deduped_skills.append(skill)

    return target_roles, deduped_skills, domains


def _infer_role_queries(target_roles: list[str], skills: list[str]) -> list[str]:
    role_queries = list(target_roles)
    for role in target_roles:
        family = ROLE_FAMILY_KEYWORDS.get(role)
        if family:
            role_queries.extend(member.lower() for member in family)

    skill_set = set(skills)
    for role_label, inferred_terms in ROLE_FAMILY_INFERENCE_KEYWORDS.items():
        if skill_set.intersection(inferred_terms):
            role_queries.append(role_label)
            role_queries.extend(member.lower() for member in ROLE_FAMILY_KEYWORDS.get(role_label, []))

    if not role_queries:
        role_queries.extend(role.lower() for role in DEFAULT_ROLE_FAMILY)

    deduped_roles: list[str] = []
    seen_roles: set[str] = set()
    for role in role_queries:
        normalized = role.strip().lower()
        if not normalized or normalized in seen_roles:
            continue
        seen_roles.add(normalized)
        deduped_roles.append(normalized)

    return deduped_roles


def _score_role_alignment(title: str, description: str, target_roles: list[str], skills: list[str]) -> tuple[int, list[str]]:
    haystack = f"{title} {description}"
    matched_roles: list[str] = []
    score = 0

    for role in _infer_role_queries(target_roles, skills):
        if role in title:
            matched_roles.append(role)
            score = max(score, 55)
        elif role in haystack:
            matched_roles.append(role)
            score = max(score, 35)

        for keyword in ROLE_SIGNAL_KEYWORDS.get(role, []):
            if keyword in title:
                matched_roles.append(keyword)
                score = max(score, 55)
            elif keyword in haystack:
                matched_roles.append(keyword)
                score = max(score, 35)

    return score, list(dict.fromkeys(matched_roles))[:4]


def _score_skill_alignment(title: str, description: str, skills: list[str]) -> tuple[int, list[str]]:
    haystack = f"{title} {description}"
    matched_skills = [skill for skill in skills if len(skill) >= 2 and skill in haystack]
    return min(len(set(matched_skills)) * 6, 30), list(dict.fromkeys(matched_skills))[:5]


def _score_domain_alignment(title: str, description: str, domains: list[str]) -> tuple[int, list[str]]:
    haystack = f"{title} {description}"
    matched_domains: list[str] = []
    score = 0

    for domain in domains:
        keywords = DOMAIN_KEYWORD_SYNONYMS.get(domain, [domain])
        if any(keyword in haystack for keyword in keywords):
            matched_domains.append(domain)
            score = max(score, 22)

    return score, list(dict.fromkeys(matched_domains))[:3]


def _build_relevance_reason(matched_roles: list[str], matched_domains: list[str], matched_skills: list[str]) -> str:
    parts: list[str] = []
    if matched_roles:
        parts.append(f"role match: {', '.join(matched_roles[:2])}")
    if matched_domains:
        parts.append(f"domain match: {', '.join(matched_domains[:2])}")
    if matched_skills:
        parts.append(f"skill overlap: {', '.join(matched_skills[:3])}")
    return "; ".join(parts) if parts else "General profile match"


def score_profile_relevance(job: dict, candidate_profile: Optional[dict]) -> tuple[bool, int, str, str]:
    title = _normalize_text(job.get("title"))
    description = _normalize_text(job.get("description"))

    if not candidate_profile:
        generic_terms = ["software engineer", "backend", "full stack", "machine learning", "data engineer"]
        generic_matches = [term for term in generic_terms if term in f"{title} {description}"]
        score = 45 if generic_matches else 0
        reason = f"general role match: {', '.join(generic_matches[:2])}" if generic_matches else "Low profile relevance"
        return score >= MIN_RELEVANCE_SCORE, score, reason, get_apply_priority(score)

    target_roles, skills, domains = _extract_profile_terms(candidate_profile)
    role_score, matched_roles = _score_role_alignment(title, description, target_roles, skills)
    skill_score, matched_skills = _score_skill_alignment(title, description, skills)
    domain_score, matched_domains = _score_domain_alignment(title, description, domains)

    score = max(0, min(role_score + skill_score + domain_score, 100))
    min_score = STRICT_PROFILE_MIN_RELEVANCE_SCORE
    if role_score == 0 and skill_score < 12:
        min_score = max(min_score, 55)
    reason = _build_relevance_reason(matched_roles, matched_domains, matched_skills)
    return score >= min_score, score, reason, get_apply_priority(score)


def screen_job(job: dict, candidate_profile: Optional[dict] = None) -> dict:
    location_ok, location_reason = _location_passes(job.get("location"))
    if not location_ok:
        return {
            "screening_status": "REJECTED",
            "screening_reason": location_reason,
            "relevance_score": 0,
            "apply_priority": "",
        }

    internship_ok, internship_reason = _internship_passes(job.get("title"))
    if not internship_ok:
        return {
            "screening_status": "REJECTED",
            "screening_reason": internship_reason,
            "relevance_score": 0,
            "apply_priority": "",
        }

    seniority_ok, seniority_reason = _seniority_passes(job.get("title"))
    if not seniority_ok:
        return {
            "screening_status": "REJECTED",
            "screening_reason": seniority_reason,
            "relevance_score": 0,
            "apply_priority": "",
        }

    role_ok, role_reason = _role_family_passes(job.get("title"), job.get("description"))
    if not role_ok:
        return {
            "screening_status": "REJECTED",
            "screening_reason": role_reason,
            "relevance_score": 0,
            "apply_priority": "",
        }

    relevance_ok, relevance_score, screening_reason, apply_priority = score_profile_relevance(job, candidate_profile)
    if not relevance_ok:
        return {
            "screening_status": "REJECTED",
            "screening_reason": screening_reason,
            "relevance_score": relevance_score,
            "apply_priority": "",
        }

    return {
        "screening_status": "PASSED",
        "screening_reason": screening_reason,
        "relevance_score": relevance_score,
        "apply_priority": apply_priority,
    }
