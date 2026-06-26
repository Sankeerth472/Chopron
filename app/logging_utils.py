from __future__ import annotations

import json
import logging
import os
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
flow_id_var: ContextVar[Optional[str]] = ContextVar("flow_id", default=None)
session_id_var: ContextVar[Optional[str]] = ContextVar("session_id", default=None)
user_id_var: ContextVar[Optional[int]] = ContextVar("user_id", default=None)
route_var: ContextVar[Optional[str]] = ContextVar("route", default=None)
method_var: ContextVar[Optional[str]] = ContextVar("method", default=None)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
            "flow_id": flow_id_var.get(),
            "session_id": session_id_var.get(),
            "user_id": user_id_var.get(),
            "route": route_var.get(),
            "method": method_var.get(),
        }

        extra_fields = getattr(record, "structured_fields", None)
        if isinstance(extra_fields, dict):
            payload.update(extra_fields)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps({key: value for key, value in payload.items() if value is not None}, ensure_ascii=True)


def configure_logging() -> None:
    root_logger = logging.getLogger()
    if getattr(root_logger, "_chopron_logging_configured", False):
        return

    level_name = os.getenv("CHOPRON_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)
    root_logger._chopron_logging_configured = True  # type: ignore[attr-defined]


def bind_log_context(**values: Any) -> None:
    mapping = {
        "request_id": request_id_var,
        "flow_id": flow_id_var,
        "session_id": session_id_var,
        "user_id": user_id_var,
        "route": route_var,
        "method": method_var,
    }
    for key, value in values.items():
        if key in mapping and value is not None:
            mapping[key].set(value)


def clear_log_context() -> None:
    request_id_var.set(None)
    flow_id_var.set(None)
    session_id_var.set(None)
    user_id_var.set(None)
    route_var.set(None)
    method_var.set(None)


def log_event(logger: logging.Logger, event: str, level: int = logging.INFO, **fields: Any) -> None:
    logger.log(level, event, extra={"structured_fields": fields})


@contextmanager
def timed_step(logger: logging.Logger, event: str, **fields: Any) -> Iterator[dict[str, Any]]:
    started_at = time.perf_counter()
    log_event(logger, f"{event}.started", **fields)
    state: dict[str, Any] = {}
    try:
        yield state
    except Exception:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        log_event(logger, f"{event}.failed", level=logging.ERROR, duration_ms=duration_ms, **fields, **state)
        raise
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    log_event(logger, f"{event}.succeeded", duration_ms=duration_ms, **fields, **state)
