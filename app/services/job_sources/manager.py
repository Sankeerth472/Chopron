from __future__ import annotations

import asyncio
import logging

from app.services.job_sources.arbeitnow import ArbeitnowSource
from app.services.job_sources.ashby import AshbySource
from app.services.job_sources.greenhouse import GreenhouseSource
from app.services.job_sources.himalayas import HimalayasSource
from app.services.job_sources.lever import LeverSource
from app.services.job_sources.remoteok import RemoteOKSource
from app.services.job_sources.remotive import RemotiveSource

logger = logging.getLogger(__name__)

JOB_SOURCES = [
    RemotiveSource(),
    RemoteOKSource(),
    HimalayasSource(),
    ArbeitnowSource(),
    GreenhouseSource(),
    LeverSource(),
    AshbySource(),
]


async def fetch_jobs_from_all_sources(search: str, limit: int) -> dict:
    tasks = [source.fetch_jobs_with_diagnostics(search, limit) for source in JOB_SOURCES]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_jobs: list[dict] = []
    diagnostics_by_source: dict[str, dict] = {}

    for source, result in zip(JOB_SOURCES, results):
        if isinstance(result, Exception):
            logger.exception("Failed to fetch jobs from %s", source.source_name, exc_info=result)
            diagnostics_by_source[source.source_name] = {
                "source": source.source_name,
                "companies_attempted": 0,
                "companies_succeeded": 0,
                "companies_failed": 0,
                "attempted_companies": [],
                "succeeded_companies": [],
                "failed_companies": [],
                "jobs_fetched": 0,
            }
            continue

        jobs = result.get("jobs", [])
        diagnostics = result.get("diagnostics", {})
        diagnostics_by_source[source.source_name] = diagnostics
        all_jobs.extend(jobs)

        logger.warning(
            "Fetch diagnostics source=%s attempted=%s succeeded=%s failed=%s jobs_fetched=%s attempted_companies=%s succeeded_companies=%s failed_companies=%s",
            source.source_name,
            diagnostics.get("companies_attempted", 0),
            diagnostics.get("companies_succeeded", 0),
            diagnostics.get("companies_failed", 0),
            diagnostics.get("jobs_fetched", 0),
            diagnostics.get("attempted_companies", []),
            diagnostics.get("succeeded_companies", []),
            diagnostics.get("failed_companies", []),
        )

    return {
        "jobs": all_jobs,
        "diagnostics": diagnostics_by_source,
    }


async def fetch_jobs_for_queries(queries: list[str], limit: int) -> dict:
    normalized_queries = [query.strip() for query in queries if query.strip()]
    remotive_queries = normalized_queries[:6] or [""]
    keyword_queries = normalized_queries[:12]
    remotive_source = next(source for source in JOB_SOURCES if source.source_name == "remotive")
    keyword_sources = [source for source in JOB_SOURCES if source.source_name in {"remoteok", "himalayas", "arbeitnow"}]
    ats_sources = [source for source in JOB_SOURCES if source.source_name not in {"remotive", "remoteok", "himalayas", "arbeitnow"}]

    remotive_tasks = [
        remotive_source.fetch_jobs_with_diagnostics(query, limit)
        for query in remotive_queries
    ]
    keyword_tasks = [
        source.fetch_jobs_with_diagnostics(keyword_queries, max(limit, 25))
        for source in keyword_sources
    ]
    ats_tasks = [
        source.fetch_jobs_with_diagnostics(keyword_queries, limit)
        for source in ats_sources
    ]

    remotive_results = await asyncio.gather(*remotive_tasks, return_exceptions=True)
    keyword_results = await asyncio.gather(*keyword_tasks, return_exceptions=True)
    ats_results = await asyncio.gather(*ats_tasks, return_exceptions=True)

    all_jobs: list[dict] = []
    diagnostics_by_source: dict[str, dict] = {}

    remotive_diagnostics = {
        "source": "remotive",
        "companies_attempted": 0,
        "companies_succeeded": 0,
        "companies_failed": 0,
        "attempted_companies": [],
        "succeeded_companies": [],
        "failed_companies": [],
        "jobs_fetched": 0,
    }

    for result in remotive_results:
        if isinstance(result, Exception):
            logger.exception("Failed to fetch jobs from remotive", exc_info=result)
            remotive_diagnostics["companies_failed"] += 1
            continue

        all_jobs.extend(result.get("jobs", []))
        diagnostics = result.get("diagnostics", {})
        remotive_diagnostics["companies_attempted"] += diagnostics.get("companies_attempted", 0)
        remotive_diagnostics["companies_succeeded"] += diagnostics.get("companies_succeeded", 0)
        remotive_diagnostics["companies_failed"] += diagnostics.get("companies_failed", 0)
        remotive_diagnostics["jobs_fetched"] += diagnostics.get("jobs_fetched", 0)
        remotive_diagnostics["attempted_companies"].extend(diagnostics.get("attempted_companies", []))
        remotive_diagnostics["succeeded_companies"].extend(diagnostics.get("succeeded_companies", []))
        remotive_diagnostics["failed_companies"].extend(diagnostics.get("failed_companies", []))

    remotive_diagnostics["attempted_companies"] = sorted(set(remotive_diagnostics["attempted_companies"]))
    remotive_diagnostics["succeeded_companies"] = sorted(set(remotive_diagnostics["succeeded_companies"]))
    remotive_diagnostics["failed_companies"] = sorted(set(remotive_diagnostics["failed_companies"]))
    diagnostics_by_source["remotive"] = remotive_diagnostics
    logger.warning(
        "Fetch diagnostics source=%s attempted=%s succeeded=%s failed=%s jobs_fetched=%s attempted_companies=%s succeeded_companies=%s failed_companies=%s",
        "remotive",
        remotive_diagnostics["companies_attempted"],
        remotive_diagnostics["companies_succeeded"],
        remotive_diagnostics["companies_failed"],
        remotive_diagnostics["jobs_fetched"],
        remotive_diagnostics["attempted_companies"],
        remotive_diagnostics["succeeded_companies"],
        remotive_diagnostics["failed_companies"],
    )

    for source, result in zip(keyword_sources, keyword_results):
        if isinstance(result, Exception):
            logger.exception("Failed to fetch jobs from %s", source.source_name, exc_info=result)
            diagnostics_by_source[source.source_name] = {
                "source": source.source_name,
                "companies_attempted": 0,
                "companies_succeeded": 0,
                "companies_failed": 0,
                "attempted_companies": [],
                "succeeded_companies": [],
                "failed_companies": [],
                "jobs_fetched": 0,
            }
            continue

        jobs = result.get("jobs", [])
        diagnostics = result.get("diagnostics", {})
        diagnostics_by_source[source.source_name] = diagnostics
        all_jobs.extend(jobs)
        logger.warning(
            "Fetch diagnostics source=%s attempted=%s succeeded=%s failed=%s jobs_fetched=%s attempted_companies=%s succeeded_companies=%s failed_companies=%s",
            source.source_name,
            diagnostics.get("companies_attempted", 0),
            diagnostics.get("companies_succeeded", 0),
            diagnostics.get("companies_failed", 0),
            diagnostics.get("jobs_fetched", 0),
            diagnostics.get("attempted_companies", []),
            diagnostics.get("succeeded_companies", []),
            diagnostics.get("failed_companies", []),
        )

    for source, result in zip(ats_sources, ats_results):
        if isinstance(result, Exception):
            logger.exception("Failed to fetch jobs from %s", source.source_name, exc_info=result)
            diagnostics_by_source[source.source_name] = {
                "source": source.source_name,
                "companies_attempted": 0,
                "companies_succeeded": 0,
                "companies_failed": 0,
                "attempted_companies": [],
                "succeeded_companies": [],
                "failed_companies": [],
                "jobs_fetched": 0,
            }
            continue

        jobs = result.get("jobs", [])
        diagnostics = result.get("diagnostics", {})
        diagnostics_by_source[source.source_name] = diagnostics
        all_jobs.extend(jobs)
        logger.warning(
            "Fetch diagnostics source=%s attempted=%s succeeded=%s failed=%s jobs_fetched=%s attempted_companies=%s succeeded_companies=%s failed_companies=%s",
            source.source_name,
            diagnostics.get("companies_attempted", 0),
            diagnostics.get("companies_succeeded", 0),
            diagnostics.get("companies_failed", 0),
            diagnostics.get("jobs_fetched", 0),
            diagnostics.get("attempted_companies", []),
            diagnostics.get("succeeded_companies", []),
            diagnostics.get("failed_companies", []),
        )

    return {
        "jobs": all_jobs,
        "diagnostics": diagnostics_by_source,
    }
