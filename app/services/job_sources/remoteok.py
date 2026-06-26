from __future__ import annotations

import httpx


class RemoteOKSource:
    source_name = "remoteok"
    base_url = "https://remoteok.com/api"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str | list[str], limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str | list[str], limit: int) -> dict:
        async with httpx.AsyncClient(timeout=20, headers=self.headers, follow_redirects=True) as client:
            response = await client.get(self.base_url)
            response.raise_for_status()
            data = response.json()

        jobs = [job for job in data if isinstance(job, dict) and job.get("id")]
        filtered_jobs = self._filter_jobs(jobs, search)[:limit]

        wrapped_jobs = [
            {
                "source": self.source_name,
                "company_slug": None,
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
                "attempted_companies": ["remoteok"],
                "succeeded_companies": ["remoteok"],
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
                    str(job.get("position", "")),
                    str(job.get("company", "")),
                    str(job.get("description", "")),
                    " ".join(str(tag) for tag in job.get("tags", [])),
                    str(job.get("location", "")),
                ]
            ).lower()
            if self._matches_search(haystack, search):
                filtered_jobs.append(job)
        return filtered_jobs
