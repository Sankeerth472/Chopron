from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from app.database.models import CandidateAutofillProfile, CandidateProfile, User

RESUME_STORAGE_DIR = Path("storage/resumes")
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_PATTERN = re.compile(r"(?:\+?\d[\d().\-\s]{7,}\d)")
URL_PATTERN = re.compile(r"https?://[^\s)]+", re.IGNORECASE)


def get_resume_storage_path(user_id: int) -> Path:
    return RESUME_STORAGE_DIR / f"user-{user_id}.pdf"


def ensure_resume_storage_dir() -> None:
    RESUME_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def save_resume_file(user_id: int, contents: bytes) -> Path:
    ensure_resume_storage_dir()
    path = get_resume_storage_path(user_id)
    path.write_bytes(contents)
    return path


def parse_custom_answers(raw: Optional[str]) -> dict[str, str]:
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    if not isinstance(parsed, dict):
        return {}

    return {
        str(key).strip(): str(value).strip()
        for key, value in parsed.items()
        if str(key).strip() and str(value).strip()
    }


def serialize_autofill_settings(record: Optional[CandidateAutofillProfile]) -> dict:
    custom_answers = parse_custom_answers(record.custom_answers_json if record else None)
    return {
        "phone": (record.phone or "") if record else "",
        "city": (record.city or "") if record else "",
        "state": (record.state or "") if record else "",
        "country": (record.country or "") if record else "",
        "postal_code": (record.postal_code or "") if record else "",
        "linkedin_url": (record.linkedin_url or "") if record else "",
        "github_url": (record.github_url or "") if record else "",
        "portfolio_url": (record.portfolio_url or "") if record else "",
        "website_url": (record.website_url or "") if record else "",
        "pronouns": (record.pronouns or "") if record else "",
        "work_authorization": (record.work_authorization or "") if record else "",
        "authorized_to_work_in_us": (record.authorized_to_work_in_us or "") if record else "",
        "requires_sponsorship": record.requires_sponsorship if record and record.requires_sponsorship is not None else None,
        "hispanic_or_latino": (record.hispanic_or_latino or "") if record else "",
        "gender_identity": (record.gender_identity or "") if record else "",
        "race_ethnicity": (record.race_ethnicity or "") if record else "",
        "veteran_status": (record.veteran_status or "") if record else "",
        "disability_status": (record.disability_status or "") if record else "",
        "custom_answers": custom_answers,
        "updated_at": record.updated_at.isoformat() if record and record.updated_at else None,
    }


def _extract_first_match(pattern: re.Pattern[str], text: str) -> str:
    match = pattern.search(text)
    return match.group(0).strip() if match else ""


def _extract_urls(text: str) -> list[str]:
    return [match.group(0).rstrip(".,") for match in URL_PATTERN.finditer(text)]


def _find_url(urls: list[str], domains: tuple[str, ...]) -> str:
    for url in urls:
        hostname = (urlparse(url).hostname or "").lower()
        if any(domain in hostname for domain in domains):
            return url
    return ""


def _normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return value.strip()


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def derive_resume_defaults(profile_record: Optional[CandidateProfile], user: User) -> dict[str, str]:
    resume_text = profile_record.raw_resume_text if profile_record else ""
    urls = _extract_urls(resume_text)
    email = _extract_first_match(EMAIL_PATTERN, resume_text) or user.email
    phone = _normalize_phone(_extract_first_match(PHONE_PATTERN, resume_text))
    first_name, last_name = _split_name(user.full_name or "")

    return {
        "full_name": user.full_name or "",
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": phone,
        "linkedin_url": _find_url(urls, ("linkedin.com",)),
        "github_url": _find_url(urls, ("github.com",)),
        "website_url": _find_url(urls, ("portfolio", "vercel.app", "netlify.app", "notion.site", "wixsite.com")),
    }


def build_autofill_payload(
    user: User,
    profile_record: Optional[CandidateProfile],
    autofill_record: Optional[CandidateAutofillProfile],
    base_url: str,
) -> dict:
    defaults = derive_resume_defaults(profile_record, user)
    settings = serialize_autofill_settings(autofill_record)
    resume_path = get_resume_storage_path(user.id)
    resume_available = resume_path.exists()
    resume_download_url = f"{base_url.rstrip('/')}/profile/resume-file" if profile_record else None
    resume_payload = None

    if resume_available:
        resume_payload = {
            "base64": base64.b64encode(resume_path.read_bytes()).decode("ascii"),
            "mime_type": "application/pdf",
        }

    return {
        "candidate": {
            "full_name": defaults["full_name"],
            "first_name": defaults["first_name"],
            "last_name": defaults["last_name"],
            "email": defaults["email"],
            "phone": settings["phone"] or defaults["phone"],
            "city": settings["city"],
            "state": settings["state"],
            "country": settings["country"],
            "postal_code": settings["postal_code"],
            "linkedin_url": settings["linkedin_url"] or defaults["linkedin_url"],
            "github_url": settings["github_url"] or defaults["github_url"],
            "portfolio_url": settings["portfolio_url"],
            "website_url": settings["website_url"] or defaults["website_url"],
            "pronouns": settings["pronouns"],
            "work_authorization": settings["work_authorization"],
            "authorized_to_work_in_us": settings["authorized_to_work_in_us"],
            "requires_sponsorship": settings["requires_sponsorship"],
            "hispanic_or_latino": settings["hispanic_or_latino"],
            "gender_identity": settings["gender_identity"],
            "race_ethnicity": settings["race_ethnicity"],
            "veteran_status": settings["veteran_status"],
            "disability_status": settings["disability_status"],
            "custom_answers": settings["custom_answers"],
        },
        "resume": {
            "filename": profile_record.filename if profile_record else "resume.pdf",
            "available": resume_available,
            "download_url": resume_download_url,
            "storage_path_exists": resume_available,
            "inline_payload": resume_payload,
        },
        "profile_id": profile_record.id if profile_record else None,
    }
