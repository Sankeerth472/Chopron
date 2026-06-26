from app.services.job_sources.remotive import RemotiveSource


async def fetch_remote_jobs(search: str, limit: int = 10):
    source = RemotiveSource()
    wrapped_jobs = await source.fetch_jobs(search, limit)
    return [job["raw_job"] for job in wrapped_jobs]
