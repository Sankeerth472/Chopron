from __future__ import annotations

import asyncio
import json
import logging
import os
import time

import httpx

from app.logging_utils import log_event

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.1:8b"
LLM_TIMEOUT_SECONDS = float(os.getenv("CHOPRON_LLM_TIMEOUT_SECONDS", "3"))
LLM_UNAVAILABLE_COOLDOWN_SECONDS = float(os.getenv("CHOPRON_LLM_UNAVAILABLE_COOLDOWN_SECONDS", "300"))
_llm_retry_after = 0.0
logger = logging.getLogger(__name__)


async def _post_generate_request(payload: dict) -> httpx.Response:
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        response = await client.post(OLLAMA_URL, json=payload)
        response.raise_for_status()
        return response


async def generate_json(prompt: str) -> dict:
    global _llm_retry_after
    now = time.monotonic()
    if now < _llm_retry_after:
        raise RuntimeError("LLM temporarily unavailable.")

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }

    try:
        started_at = time.perf_counter()
        response = await asyncio.wait_for(_post_generate_request(payload), timeout=LLM_TIMEOUT_SECONDS)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        log_event(logger, "llm.generate_json.succeeded", duration_ms=duration_ms, model=MODEL_NAME, prompt_chars=len(prompt))
    except Exception as exc:
        _llm_retry_after = time.monotonic() + LLM_UNAVAILABLE_COOLDOWN_SECONDS
        log_event(
            logger,
            "llm.generate_json.failed",
            level=logging.WARNING,
            model=MODEL_NAME,
            prompt_chars=len(prompt),
            retry_after_seconds=LLM_UNAVAILABLE_COOLDOWN_SECONDS,
            error_type=type(exc).__name__,
        )
        raise

    result = response.json()
    raw_output = result.get("response", "")
    _llm_retry_after = 0.0
    return json.loads(raw_output)
