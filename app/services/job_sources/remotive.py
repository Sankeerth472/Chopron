from __future__ import annotations

import httpx


class RemotiveSource:
    source_name = "remotive"
    base_url = "https://remotive.com/api/remote-jobs"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str, limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str, limit: int) -> dict:
        params = {
            "search": search,
            "limit": limit,
        }

        async with httpx.AsyncClient(timeout=20, headers=self.headers) as client:
            response = await client.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()

        jobs = data.get("jobs", [])[:limit]

        wrapped_jobs = [
            {
                "source": self.source_name,
                "company_slug": None,
                "raw_job": job,
            }
            for job in jobs
        ]

        return {
            "jobs": wrapped_jobs,
            "diagnostics": {
                "source": self.source_name,
                "companies_attempted": 1,
                "companies_succeeded": 1,
                "companies_failed": 0,
                "attempted_companies": ["remotive"],
                "succeeded_companies": ["remotive"],
                "failed_companies": [],
                "jobs_fetched": len(wrapped_jobs),
            },
        }
