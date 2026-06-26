import type {
  AutofillPayload,
  AutofillSettings,
  AuthResponse,
  FetchJobsResponse,
  JobDetail,
  JobSummary,
  JobsResponse,
  ProfileResponse,
  UserJobStatus,
} from '../types/api'
import { getAuthToken } from './auth'
import { createRequestId, getClientSessionId, getOrCreateActiveFlowId } from './request-context'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const DEFAULT_TIMEOUT_MS = 30_000

type RequestOptions = RequestInit & {
  timeoutMs?: number
  flowId?: string
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function formatApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const detail = 'detail' in payload ? (payload as { detail?: unknown }).detail : undefined
    const error = 'error' in payload ? (payload as { error?: unknown }).error : undefined

    if (typeof detail === 'string' && detail.trim()) return detail
    if (typeof error === 'string' && error.trim()) return error
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg?: unknown }).msg)
          return ''
        })
        .filter(Boolean)
      if (messages.length > 0) return messages.join(', ')
    }
  }

  return `Request failed with status ${status}`
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers ?? {})
  const requestId = createRequestId()
  const sessionId = getClientSessionId()
  const flowId = init?.flowId ?? getOrCreateActiveFlowId()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('X-Request-ID', requestId)
  headers.set('X-Session-ID', sessionId)
  headers.set('X-Flow-ID', flowId)

  const controller = new AbortController()
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Check the backend logs for request ${requestId}.`, 408)
    }
    throw new ApiError(`Cannot reach the Chopron backend at ${API_BASE_URL}. Start the FastAPI server and try again.`, 0)
  } finally {
    window.clearTimeout(timeoutHandle)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const message = formatApiErrorMessage(payload, response.status)
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export async function getMyProfile() {
  return request<ProfileResponse>('/profile/me')
}

export async function getAutofillSettings() {
  return request<AutofillSettings>('/profile/autofill-settings')
}

export async function updateAutofillSettings(payload: Omit<AutofillSettings, 'updated_at'>) {
  return request<AutofillSettings>('/profile/autofill-settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function getAutofillPayload() {
  return request<AutofillPayload>('/profile/autofill-payload')
}

export async function uploadResume(file: File, flowId?: string) {
  const formData = new FormData()
  formData.append('file', file)

  return request<ProfileResponse>('/profile/upload-resume', {
    method: 'POST',
    body: formData,
    flowId,
    timeoutMs: 20_000,
  })
}

export async function fetchJobs(payload: { search?: string; limit?: number; profileId?: number; flowId?: string }) {
  return request<FetchJobsResponse>('/jobs/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      search: payload.search ?? 'machine learning engineer',
      limit: payload.limit ?? 25,
      profile_id: payload.profileId ?? null,
    }),
    flowId: payload.flowId,
    timeoutMs: 120_000,
  })
}

export async function getMyJobs(limit = 100, offset = 0) {
  return request<JobsResponse>(`/jobs/me?limit=${limit}&offset=${offset}`)
}

export async function getSavedJobs(limit = 100, offset = 0) {
  return request<JobsResponse>(`/jobs/saved?limit=${limit}&offset=${offset}`)
}

export async function getAppliedJobs(limit = 100, offset = 0) {
  return request<JobsResponse>(`/jobs/applied?limit=${limit}&offset=${offset}`)
}

export async function getJobDetail(userJobId: number) {
  return request<JobDetail>(`/jobs/${userJobId}`)
}

export async function updateJobStatus(userJobId: number, status: UserJobStatus) {
  return request<JobSummary>(`/jobs/${userJobId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  })
}

export async function getBackendHealth() {
  return request<{ status: string }>('/')
}

export async function signup(payload: { email: string; password: string }) {
  return request<AuthResponse>('/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function login(payload: { email: string; password: string }) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function getCurrentUser() {
  return request<{ user: AuthResponse['user'] }>('/me')
}

export function getApiBaseUrl() {
  return API_BASE_URL
}

export { ApiError }
