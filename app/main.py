import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database.database import initialize_database
from app.logging_utils import bind_log_context, clear_log_context, configure_logging, log_event
from app.routers import auth, jobs, profiles

configure_logging()
initialize_database()

app = FastAPI()
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(profiles.router, prefix="/profile", tags=["profile"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.add_api_route("/me", auth.me, methods=["GET"], tags=["auth"])


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    flow_id = request.headers.get("x-flow-id") or request_id
    session_id = request.headers.get("x-session-id")

    clear_log_context()
    bind_log_context(
        request_id=request_id,
        flow_id=flow_id,
        session_id=session_id,
        route=request.url.path,
        method=request.method,
    )

    started_at = time.perf_counter()
    log_event(logger, "request.started", client_host=request.client.host if request.client else None)

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        log_event(logger, "request.failed", level=logging.ERROR, duration_ms=duration_ms)
        clear_log_context()
        raise

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Flow-ID"] = flow_id
    if session_id:
        response.headers["X-Session-ID"] = session_id
    log_event(logger, "request.completed", status_code=response.status_code, duration_ms=duration_ms)
    clear_log_context()
    return response


@app.get("/")
def health_check():
    return {"status": "ok"}
