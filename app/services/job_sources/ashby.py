from __future__ import annotations

import logging

import httpx

from app.config.job_boards import ASHBY_COMPANIES

logger = logging.getLogger(__name__)


class AshbySource:
    source_name = "ashby"
    base_url = "https://api.ashbyhq.com/posting-api/job-board"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str, limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str, limit: int) -> dict:
        wrapped_jobs: list[dict] = []
        succeeded_companies: list[str] = []
        failed_companies: list[str] = []

        async with httpx.AsyncClient(timeout=20, headers=self.headers) as client:
            for company_slug in ASHBY_COMPANIES:
                try:
                    response = await client.get(
                        f"{self.base_url}/{company_slug}",
                        params={"includeCompensation": "true"},
                    )
                    response.raise_for_status()
                    data = response.json()
                    jobs = self._extract_jobs(data)
                    jobs = self._filter_jobs(jobs, search)[:limit]
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
                "companies_attempted": len(ASHBY_COMPANIES),
                "companies_succeeded": len(succeeded_companies),
                "companies_failed": len(failed_companies),
                "attempted_companies": ASHBY_COMPANIES,
                "succeeded_companies": succeeded_companies,
                "failed_companies": failed_companies,
                "jobs_fetched": len(wrapped_jobs),
            },
        }

    def _extract_jobs(self, data: dict) -> list[dict]:
        if isinstance(data.get("jobs"), list):
            return data["jobs"]
        if isinstance(data.get("jobPostings"), list):
            return data["jobPostings"]
        return []

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
                    job.get("locationName", ""),
                    job.get("location", ""),
                    job.get("descriptionPlain", ""),
                    job.get("descriptionHtml", ""),
                    job.get("team", ""),
                    job.get("department", ""),
                ]
            ).lower()

            if self._matches_search(haystack, search):
                filtered_jobs.append(job)

        return filtered_jobs
