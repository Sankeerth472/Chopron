from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")
    candidate_profiles = relationship("CandidateProfile", back_populates="user", cascade="all, delete-orphan")
    autofill_profile = relationship("CandidateAutofillProfile", back_populates="user", cascade="all, delete-orphan", uselist=False)
    user_jobs = relationship("UserJob", back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="sessions")


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    raw_resume_text = Column(Text, nullable=False)
    profile_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="candidate_profiles")


class CandidateAutofillProfile(Base):
    __tablename__ = "candidate_autofill_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, unique=True)
    phone = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    website_url = Column(String, nullable=True)
    pronouns = Column(String, nullable=True)
    work_authorization = Column(String, nullable=True)
    authorized_to_work_in_us = Column(String, nullable=True)
    requires_sponsorship = Column(Boolean, nullable=True)
    hispanic_or_latino = Column(String, nullable=True)
    gender_identity = Column(String, nullable=True)
    race_ethnicity = Column(String, nullable=True)
    veteran_status = Column(String, nullable=True)
    disability_status = Column(String, nullable=True)
    custom_answers_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="autofill_profile")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_jobs_source_external_id"),
        UniqueConstraint("url", name="uq_jobs_url"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, nullable=False)
    external_id = Column(String, nullable=True)
    title = Column(String, nullable=False, default="")
    company = Column(String, nullable=False, default="")
    location = Column(String, nullable=False, default="")
    remote = Column(Boolean, nullable=False, default=False)
    url = Column(String, nullable=True)
    description = Column(Text, nullable=False, default="")
    publication_date = Column(String, nullable=True)
    raw_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user_jobs = relationship("UserJob", back_populates="job", cascade="all, delete-orphan")


class UserJob(Base):
    __tablename__ = "user_jobs"
    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_user_jobs_user_id_job_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    match_score = Column(Integer, nullable=True)
    match_reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="fetched")
    screening_status = Column(String, nullable=True)
    screening_reason = Column(Text, nullable=True)
    relevance_score = Column(Integer, nullable=True)
    apply_priority = Column(String, nullable=True)
    candidate_fit_score = Column(Integer, nullable=True)
    fit_summary = Column(Text, nullable=True)
    strengths = Column(Text, nullable=True)
    gaps = Column(Text, nullable=True)
    apply_recommendation = Column(String, nullable=True)
    resume_keywords_to_add = Column(Text, nullable=True)
    resume_angle = Column(Text, nullable=True)
    cover_letter_angle = Column(Text, nullable=True)
    interview_prep_topics = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    applied_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="user_jobs")
    job = relationship("Job", back_populates="user_jobs")
