export type CandidateProfile = {
  target_roles?: string[]
  seniority?: string
  core_skills?: string[]
  platforms?: string[]
  programming_languages?: string[]
  frameworks_tools?: string[]
  databases?: string[]
  cloud_devops?: string[]
  domains?: string[]
  business_functions?: string[]
  role_hints?: string[]
  experience_summary?: string
  education?: string[]
  projects?: string[]
  strong_keywords?: string[]
  missing_or_weaker_skills?: string[]
  [key: string]: unknown
}

export type ProfileResponse = {
  profile_id: number
  filename: string
  candidate_profile: CandidateProfile
  created_at: string | null
  updated_at: string | null
  message?: string
}

export type AutofillSettings = {
  phone: string
  city: string
  state: string
  country: string
  postal_code: string
  linkedin_url: string
  github_url: string
  portfolio_url: string
  website_url: string
  pronouns: string
  work_authorization: string
  authorized_to_work_in_us: string
  requires_sponsorship: boolean | null
  hispanic_or_latino: string
  gender_identity: string
  race_ethnicity: string
  veteran_status: string
  disability_status: string
  custom_answers: Record<string, string>
  updated_at: string | null
}

export type AutofillPayload = {
  candidate: {
    full_name: string
    first_name: string
    last_name: string
    email: string
    phone: string
    city: string
    state: string
    country: string
    postal_code: string
    linkedin_url: string
    github_url: string
    portfolio_url: string
    website_url: string
    pronouns: string
    work_authorization: string
    authorized_to_work_in_us: string
    requires_sponsorship: boolean | null
    hispanic_or_latino: string
    gender_identity: string
    race_ethnicity: string
    veteran_status: string
    disability_status: string
    custom_answers: Record<string, string>
  }
  resume: {
    filename: string
    available: boolean
    download_url: string | null
  }
  profile_id: number | null
}

export type UserJobStatus = 'fetched' | 'saved' | 'applied' | 'rejected'

export type JobSummary = {
  id: number
  job_id: number
  status: UserJobStatus
  match_score: number | null
  match_reason: string
  title: string
  company: string
  location: string
  remote: boolean
  source: string
  url: string
  description: string
  publication_date: string | null
  relevance_score: number
  candidate_fit_score: number | null
  apply_priority: string
  apply_recommendation: string
  applied_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type JobsResponse = {
  count: number
  total_count: number
  limit: number
  offset: number
  has_more: boolean
  jobs: JobSummary[]
}

export type JobDetail = JobSummary & {
  screening_status?: string
  screening_reason?: string
  fit_summary?: string
  strengths?: string[]
  gaps?: string[]
  resume_keywords_to_add?: string[]
  resume_angle?: string
  cover_letter_angle?: string
  interview_prep_topics?: string[]
}

export type FetchJobsResponse = {
  generated_queries: string[]
  fetched_count: number
  normalized_count: number
  deduplicated_count: number
  screened_count: number
  passed_count: number
  rejected_count: number
  saved_count: number
  updated_count: number
  source_statistics: Record<string, Record<string, number>>
  jobs: JobSummary[]
}

export type AuthUser = {
  id: number
  email: string
  full_name: string
  created_at: string | null
}

export type AuthResponse = {
  token: string
  user: AuthUser
}
