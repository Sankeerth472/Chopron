from __future__ import annotations

import httpx


class ArbeitnowSource:
    source_name = "arbeitnow"
    base_url = "https://www.arbeitnow.com/api/job-board-api"
    headers = {"User-Agent": "Chopron/0.1"}

    async def fetch_jobs(self, search: str | list[str], limit: int) -> list[dict]:
        return (await self.fetch_jobs_with_diagnostics(search, limit))["jobs"]

    async def fetch_jobs_with_diagnostics(self, search: str | list[str], limit: int) -> dict:
        page = 1
        filtered_jobs: list[dict] = []
        pages_attempted: list[str] = []

        async with httpx.AsyncClient(timeout=20, headers=self.headers, follow_redirects=True) as client:
            while len(filtered_jobs) < limit and page <= 3:
                response = await client.get(self.base_url, params={"page": page})
                response.raise_for_status()
                data = response.json()
                jobs = data.get("data", [])
                pages_attempted.append(f"page-{page}")
                if not jobs:
                    break

                filtered_jobs.extend(job for job in jobs if self._matches_job(job, search))

                next_link = ((data.get("links") or {}).get("next")) if isinstance(data, dict) else None
                if not next_link:
                    break
                page += 1

        wrapped_jobs = [
            {
                "source": self.source_name,
                "company_slug": None,
                "raw_job": job,
            }
            for job in filtered_jobs[:limit]
        ]

        return {
            "jobs": wrapped_jobs,
            "diagnostics": {
                "source": self.source_name,
                "companies_attempted": len(pages_attempted),
                "companies_succeeded": len(pages_attempted),
                "companies_failed": 0,
                "attempted_companies": pages_attempted,
                "succeeded_companies": pages_attempted,
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

    def _matches_job(self, job: dict, search: str | list[str]) -> bool:
        if isinstance(search, str) and not search.strip():
            return True

        haystack = " ".join(
            [
                str(job.get("title", "")),
                str(job.get("company_name", "")),
                str(job.get("description", "")),
                str(job.get("location", "")),
                " ".join(str(tag) for tag in job.get("tags", [])),
                " ".join(str(job_type) for job_type in job.get("job_types", [])),
            ]
        ).lower()
        return self._matches_search(haystack, search)
