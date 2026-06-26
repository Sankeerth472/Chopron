const AUTH_STORAGE_KEY = 'chopron-auth-session'

import type { AuthUser } from '../types/api'

export type AuthSession = {
  token: string
  user: AuthUser
}

export function getStoredSession(): AuthSession | null {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (!parsed.token || !parsed.user?.email) return null
    return {
      token: parsed.token,
      user: parsed.user,
    }
  } catch {
    return null
  }
}

export function storeSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function signOut() {
  clearSession()
  window.location.reload()
}

export function getAuthToken() {
  return getStoredSession()?.token ?? null
}
