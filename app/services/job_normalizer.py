from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from html import unescape
from typing import Optional


def clean_html(raw_html: Optional[str]) -> str:
    if not raw_html:
        return ""

    normalized_html = unescape(raw_html)
    normalized_html = normalized_html.replace("\r", "\n")
    normalized_html = re.sub(r"</(p|div|li|ul|ol|br|h1|h2|h3|h4|h5|h6)>", "\n", normalized_html, flags=re.IGNORECASE)
    normalized_html = re.sub(r"<li[^>]*>", "• ", normalized_html, flags=re.IGNORECASE)
    clean_text = re.sub(r"<[^>]+>", " ", normalized_html)
    clean_text = re.sub(r"[ \t]+\n", "\n", clean_text)
    clean_text = re.sub(r"\n[ \t]+", "\n", clean_text)
    clean_text = re.sub(r"[ \t]{2,}", " ", clean_text)
    clean_text = re.sub(r"\n{3,}", "\n\n", clean_text)
    clean_text = clean_text.replace(" • ", "\n• ")
    lines = [line.strip() for line in clean_text.split("\n")]
    non_empty_lines = [line for line in lines if line]
    return "\n".join(non_empty_lines).strip()


def _stringify_salary(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _extract_salary_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for preferred_key in ("summary", "compensationSummary", "payRange", "range", "display", "title"):
            preferred_value = value.get(preferred_key)
            if isinstance(preferred_value, str) and preferred_value.strip():
                return preferred_value.strip()

        for nested_value in value.values():
            extracted = _extract_salary_text(nested_value)
            if extracted and ("$" in extracted or "usd" in extracted.lower() or "salary" in extracted.lower()):
                return extracted

        for nested_value in value.values():
            extracted = _extract_salary_text(nested_value)
            if extracted:
                return extracted

    if isinstance(value, list):
        for item in value:
            extracted = _extract_salary_text(item)
            if extracted and ("$" in extracted or "usd" in extracted.lower() or "salary" in extracted.lower()):
                return extracted
        for item in value:
            extracted = _extract_salary_text(item)
            if extracted:
                return extracted

    return ""


def _join_non_empty(parts: list[str]) -> str:
    return "\n\n".join(part.strip() for part in parts if part and part.strip())


def _normalize_timestamp(value: object) -> Optional[str]:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()

    if isinstance(value, str) and value.strip().isdigit():
        return datetime.fromtimestamp(int(value.strip()), tz=timezone.utc).isoformat()

    if isinstance(value, str) and value.strip():
        return value.strip()

    return None


def _coerce_to_text_list(value: object) -> list[str]:
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    result.append(text)
                result.extend(_coerce_to_text_list(item.get("content")))
        return result
    if isinstance(value, str):
        return [value]
    return []


def normalize_remotive_job(job: dict) -> dict:
    return {
        "source": "remotive",
        "source_job_id": str(job.get("id")),
        "title": job.get("title"),
        "company": job.get("company_name"),
        "location": job.get("candidate_required_location"),
        "url": job.get("url"),
        "description": job.get("description"),
        "job_type": job.get("job_type"),
        "salary": job.get("salary"),
        "published_at": job.get("publication_date"),
        "raw_data": job,
    }


def normalize_greenhouse_job(job: dict, company_slug: Optional[str] = None) -> dict:
    return {
        "source": "greenhouse",
        "source_job_id": str(job.get("id")),
        "title": job.get("title"),
        "company": company_slug,
        "location": (job.get("location") or {}).get("name"),
        "url": job.get("absolute_url"),
        "description": job.get("content"),
        "job_type": None,
        "salary": None,
        "published_at": job.get("updated_at") or job.get("first_published"),
        "raw_data": job,
    }


def normalize_lever_job(job: dict, company_slug: Optional[str] = None) -> dict:
    categories = job.get("categories") or {}
    description_parts = [
        job.get("descriptionPlain", ""),
        *_coerce_to_text_list(job.get("lists")),
        job.get("additionalPlain", ""),
    ]

    return {
        "source": "lever",
        "source_job_id": job.get("id"),
        "title": job.get("text"),
        "company": company_slug,
        "location": categories.get("location"),
        "url": job.get("hostedUrl") or job.get("applyUrl"),
        "description": _join_non_empty(description_parts),
        "job_type": categories.get("commitment"),
        "salary": None,
        "published_at": job.get("createdAt"),
        "raw_data": job,
    }


def normalize_ashby_job(job: dict, company_slug: Optional[str] = None) -> dict:
    return {
        "source": "ashby",
        "source_job_id": job.get("id"),
        "title": job.get("title"),
        "company": company_slug,
        "location": job.get("locationName") or job.get("location"),
        "url": job.get("jobUrl") or job.get("applyUrl"),
        "description": job.get("descriptionPlain") or job.get("descriptionHtml"),
        "job_type": job.get("employmentType"),
        "salary": _extract_salary_text(job.get("compensation")),
        "published_at": job.get("publishedAt"),
        "raw_data": job,
    }


def normalize_remoteok_job(job: dict) -> dict:
    return {
        "source": "remoteok",
        "source_job_id": str(job.get("id")),
        "title": job.get("position"),
        "company": job.get("company"),
        "location": job.get("location"),
        "url": job.get("url") or job.get("apply_url"),
        "description": job.get("description"),
        "job_type": None,
        "salary": None,
        "published_at": job.get("date"),
        "raw_data": job,
    }


def normalize_himalayas_job(job: dict, company_slug: Optional[str] = None) -> dict:
    return {
        "source": "himalayas",
        "source_job_id": str(job.get("id") or job.get("slug") or ""),
        "title": job.get("title"),
        "company": job.get("companyName") or company_slug,
        "location": ", ".join(job.get("locationRestrictions", [])) if isinstance(job.get("locationRestrictions"), list) else "",
        "url": job.get("url") or job.get("applyUrl"),
        "description": job.get("description") or job.get("excerpt"),
        "job_type": job.get("employmentType"),
        "salary": _stringify_salary({
            "minSalary": job.get("minSalary"),
            "maxSalary": job.get("maxSalary"),
            "currency": job.get("currency"),
            "salaryPeriod": job.get("salaryPeriod"),
        }),
        "published_at": job.get("publishedAt") or job.get("updatedAt"),
        "raw_data": job,
    }


def normalize_arbeitnow_job(job: dict) -> dict:
    location = job.get("location") or ("Remote" if job.get("remote") else "")
    return {
        "source": "arbeitnow",
        "source_job_id": str(job.get("slug") or job.get("url") or ""),
        "title": job.get("title"),
        "company": job.get("company_name"),
        "location": location,
        "url": job.get("url"),
        "description": job.get("description"),
        "job_type": ", ".join(job.get("job_types", [])) if isinstance(job.get("job_types"), list) else None,
        "salary": None,
        "published_at": _normalize_timestamp(job.get("created_at")),
        "raw_data": job,
    }


def normalize_job(source: str, raw_job: dict, company_slug: Optional[str] = None) -> dict:
    if source == "remotive":
        return normalize_remotive_job(raw_job)
    if source == "greenhouse":
        return normalize_greenhouse_job(raw_job, company_slug)
    if source == "lever":
        return normalize_lever_job(raw_job, company_slug)
    if source == "ashby":
        return normalize_ashby_job(raw_job, company_slug)
    if source == "remoteok":
        return normalize_remoteok_job(raw_job)
    if source == "himalayas":
        return normalize_himalayas_job(raw_job, company_slug)
    if source == "arbeitnow":
        return normalize_arbeitnow_job(raw_job)

    raise ValueError(f"Unsupported job source: {source}")


def to_job_record(normalized_job: dict) -> dict:
    raw_data = normalized_job.get("raw_data") or {}
    location = normalized_job.get("location") or ""
    remote = "remote" in location.lower()
    return {
        "external_id": str(normalized_job.get("source_job_id")).strip() if normalized_job.get("source_job_id") else None,
        "source": normalized_job.get("source") or "",
        "title": normalized_job.get("title") or "",
        "company": normalized_job.get("company") or "",
        "location": location,
        "remote": remote,
        "url": (normalized_job.get("url") or "").strip() or None,
        "description": clean_html(normalized_job.get("description")),
        "raw_json": json.dumps(raw_data),
        "publication_date": normalized_job.get("published_at") or "",
    }


def normalize_remotive_jobs(jobs: list[dict]) -> list[dict]:
    return [to_job_record(normalize_remotive_job(job)) for job in jobs]
