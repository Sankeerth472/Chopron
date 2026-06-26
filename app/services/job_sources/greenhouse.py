from __future__ import annotations

import logging

import httpx

from app.config.job_boards import GREENHOUSE_COMPANIES

logger = logging.getLogger(__name__)


class GreenhouseSource:
    source_name = "greenhouse"
    base_url = "https://boards-api.greenhouse.io/v1/boards"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str, limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str, limit: int) -> dict:
        wrapped_jobs: list[dict] = []
        succeeded_companies: list[str] = []
        failed_companies: list[str] = []

        async with httpx.AsyncClient(timeout=20, headers=self.headers) as client:
            for company_slug in GREENHOUSE_COMPANIES:
                try:
                    response = await client.get(
                        f"{self.base_url}/{company_slug}/jobs",
                        params={"content": "true"},
                    )
                    response.raise_for_status()
                    data = response.json()
                    jobs = self._filter_jobs(data.get("jobs", []), search)[:limit]
                    wrapped_jobs.extend(
                        {
                            "source": self.source_name,
                            "company_slug": company_slug,
                            "raw_job": job,
                        }
                        for job in jobs
                    )
                    succeeded_companies.append(company_slug)
                except httpx.HTTPError as exc:
                    failed_companies.append(company_slug)
                    logger.warning(
                        "Failed to fetch %s jobs for company_slug=%s: %s",
                        self.source_name,
                        company_slug,
                        exc,
                    )

        return {
            "jobs": wrapped_jobs,
            "diagnostics": {
                "source": self.source_name,
                "companies_attempted": len(GREENHOUSE_COMPANIES),
                "companies_succeeded": len(succeeded_companies),
                "companies_failed": len(failed_companies),
                "attempted_companies": GREENHOUSE_COMPANIES,
                "succeeded_companies": succeeded_companies,
                "failed_companies": failed_companies,
                "jobs_fetched": len(wrapped_jobs),
            },
        }

    def _matches_search(self, haystack: str, search: str | list[str]) -> bool:
        if isinstance(search, list):
            queries = [query.strip().lower() for query in search if query.strip()]
            if not queries:
                return True
            return any(query in haystack for query in queries)

        if not search.strip():
            return True

        return search.lower() in haystack

    def _filter_jobs(self, jobs: list[dict], search: str | list[str]) -> list[dict]:
        if isinstance(search, str) and not search.strip():
            return jobs

        filtered_jobs = []

        for job in jobs:
            haystack = " ".join(
                [
                    job.get("title", ""),
                    ((job.get("location") or {}).get("name", "")),
                    job.get("content", ""),
                    " ".join(department.get("name", "") for department in job.get("departments", [])),
                    " ".join(office.get("name", "") for office in job.get("offices", [])),
                ]
            ).lower()

            if self._matches_search(haystack, search):
                filtered_jobs.append(job)

        return filtered_jobs
