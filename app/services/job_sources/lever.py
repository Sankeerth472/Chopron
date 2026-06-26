from __future__ import annotations

import logging

import httpx

from app.config.job_boards import LEVER_COMPANIES

logger = logging.getLogger(__name__)


class LeverSource:
    source_name = "lever"
    base_url = "https://api.lever.co/v0/postings"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str, limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str, limit: int) -> dict:
        wrapped_jobs: list[dict] = []
        succeeded_companies: list[str] = []
        failed_companies: list[str] = []

        async with httpx.AsyncClient(timeout=20, headers=self.headers) as client:
            for company_slug in LEVER_COMPANIES:
                try:
                    response = await client.get(
                        f"{self.base_url}/{company_slug}",
                        params={"mode": "json"},
                    )
                    response.raise_for_status()
                    jobs = self._filter_jobs(response.json(), search)[:limit]
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
                "companies_attempted": len(LEVER_COMPANIES),
                "companies_succeeded": len(succeeded_companies),
                "companies_failed": len(failed_companies),
                "attempted_companies": LEVER_COMPANIES,
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
            categories = job.get("categories") or {}
            description_segments = [
                job.get("descriptionPlain", ""),
                job.get("additionalPlain", ""),
                categories.get("team", ""),
                categories.get("location", ""),
            ]

            for list_block in job.get("lists", []):
                description_segments.append(list_block.get("text", ""))
                description_segments.extend(
                    content for content in list_block.get("content", []) if isinstance(content, str)
                )

            haystack = " ".join([job.get("text", ""), *description_segments]).lower()
            if self._matches_search(haystack, search):
                filtered_jobs.append(job)

        return filtered_jobs
