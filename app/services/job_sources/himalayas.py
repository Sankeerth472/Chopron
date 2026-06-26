from __future__ import annotations

import httpx


class HimalayasSource:
    source_name = "himalayas"
    base_url = "https://himalayas.app/jobs/api"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str | list[str], limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str | list[str], limit: int) -> dict:
        async with httpx.AsyncClient(timeout=20, headers=self.headers, follow_redirects=True) as client:
            response = await client.get(self.base_url, params={"limit": min(max(limit, 20), 100)})
            response.raise_for_status()
            data = response.json()

        jobs = data.get("jobs", [])
        filtered_jobs = self._filter_jobs(jobs, search)[:limit]

        wrapped_jobs = [
            {
                "source": self.source_name,
                "company_slug": job.get("companySlug"),
                "raw_job": job,
            }
            for job in filtered_jobs
        ]

        return {
            "jobs": wrapped_jobs,
            "diagnostics": {
                "source": self.source_name,
                "companies_attempted": 1,
                "companies_succeeded": 1,
                "companies_failed": 0,
                "attempted_companies": ["himalayas"],
                "succeeded_companies": ["himalayas"],
                "failed_companies": [],
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

        filtered_jobs: list[dict] = []
        for job in jobs:
            haystack = " ".join(
                [
                    str(job.get("title", "")),
                    str(job.get("companyName", "")),
                    str(job.get("description", "")),
                    str(job.get("excerpt", "")),
                    " ".join(str(category) for category in job.get("categories", [])),
                    " ".join(str(location) for location in job.get("locationRestrictions", [])),
                ]
            ).lower()
            if self._matches_search(haystack, search):
                filtered_jobs.append(job)
        return filtered_jobs
