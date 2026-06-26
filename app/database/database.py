from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./chopron.db"
LEGACY_DATABASE_PATH = Path("jobs.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def _rename_legacy_jobs_table() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "jobs" not in table_names:
        return

    job_columns = {column["name"] for column in inspector.get_columns("jobs")}
    if "user_id" not in job_columns or "user_jobs" in table_names:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE jobs RENAME TO jobs_legacy_backup"))


def _ensure_updated_at_columns() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    alter_statements = []

    if "candidate_profiles" in table_names:
        profile_columns = {column["name"] for column in inspector.get_columns("candidate_profiles")}
        if "updated_at" not in profile_columns:
            alter_statements.append("ALTER TABLE candidate_profiles ADD COLUMN updated_at DATETIME")

    if "user_jobs" in table_names:
        user_job_columns = {column["name"] for column in inspector.get_columns("user_jobs")}
        if "updated_at" not in user_job_columns:
            alter_statements.append("ALTER TABLE user_jobs ADD COLUMN updated_at DATETIME")
        if "applied_at" not in user_job_columns:
            alter_statements.append("ALTER TABLE user_jobs ADD COLUMN applied_at DATETIME")

    if not alter_statements:
        return

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))


def _ensure_jobs_columns() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "jobs" not in table_names:
        return

    job_columns = {column["name"] for column in inspector.get_columns("jobs")}
    alter_statements = []

    if "remote" not in job_columns:
        alter_statements.append("ALTER TABLE jobs ADD COLUMN remote BOOLEAN NOT NULL DEFAULT 0")
    if "url" not in job_columns:
        alter_statements.append("ALTER TABLE jobs ADD COLUMN url VARCHAR")
    if "publication_date" not in job_columns:
        alter_statements.append("ALTER TABLE jobs ADD COLUMN publication_date VARCHAR")

    if not alter_statements:
        return

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))

        # Backfill renamed legacy fields when upgrading an existing SQLite file.
        if "job_url" in job_columns:
            connection.execute(
                text(
                    "UPDATE jobs SET url = COALESCE(url, job_url) "
                    "WHERE job_url IS NOT NULL AND (url IS NULL OR url = '')"
                )
            )
        if "published_at" in job_columns:
            connection.execute(
                text(
                    "UPDATE jobs SET publication_date = COALESCE(publication_date, published_at) "
                    "WHERE published_at IS NOT NULL "
                    "AND (publication_date IS NULL OR publication_date = '')"
                )
            )


def initialize_database() -> None:
    _rename_legacy_jobs_table()
    Base.metadata.create_all(bind=engine)
    _ensure_updated_at_columns()
    _ensure_jobs_columns()

    if LEGACY_DATABASE_PATH.exists():
        # Legacy file is intentionally ignored. The app now uses chopron.db only.
        pass
