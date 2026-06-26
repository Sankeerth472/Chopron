from __future__ import annotations

from typing import Protocol


class JobSource(Protocol):
    source_name: str

    async def fetch_jobs(self, search: str, limit: int) -> list[dict]:
        ...
