# Chopron

## API Contract

### `POST /profiles/upload-resume`
Uploads a PDF resume, extracts text, generates a candidate profile, and saves it.

Response:
- `profile_id`
- `filename`
- `candidate_profile`
- `created_at`
- `message`

### `GET /profiles/latest`
Returns the latest saved candidate profile.

Response:
- `profile_id`
- `filename`
- `candidate_profile`
- `created_at`

Missing profile response:
```json
{
  "error": "No candidate profile found. Please upload a resume first."
}
```

### `GET /jobs/fetch`
Runs the backend ingestion pipeline:
1. Load candidate profile
2. Generate role-family queries
3. Fetch jobs from Remotive, Greenhouse, Lever, and Ashby
4. Normalize and deduplicate jobs
5. Apply code-based screening and scoring
6. Run candidate-fit evaluation for stronger matches
7. Save/update jobs in SQLite

Summary response:
- `generated_queries`
- `fetched_count`
- `normalized_count`
- `deduplicated_count`
- `screened_count`
- `passed_count`
- `rejected_count`
- `saved_count`
- `updated_count`
- `source_statistics`
- `jobs`

Missing profile response:
```json
{
  "error": "No candidate profile found. Please upload a resume first."
}
```

### `GET /jobs`
Returns list-friendly job cards only.

Fields:
- `id`
- `title`
- `company`
- `location`
- `salary`
- `job_url`
- `source`
- `relevance_score`
- `candidate_fit_score`
- `apply_priority`
- `apply_recommendation`
- `screening_reason`
- `published_at`
- `created_at`

Sorting:
1. `candidate_fit_score` descending
2. `relevance_score` descending
3. newest `published_at`
4. newest `created_at`

### `GET /jobs/{job_id}`
Returns full job detail.

Fields:
- all fields from `GET /jobs`
- `screening_status`
- `description`
- `fit_summary`
- `strengths`
- `gaps`
- `resume_keywords_to_add`
- `resume_angle`
- `cover_letter_angle`
- `interview_prep_topics`

Missing job response:
```json
{
  "error": "Job not found."
}
```
