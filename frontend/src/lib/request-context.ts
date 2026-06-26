const SESSION_STORAGE_KEY = 'chopron-client-session-id'
const FLOW_STORAGE_KEY = 'chopron-active-flow-id'

function ensureBrowserCrypto() {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Browser crypto API is unavailable.')
  }
}

export function getClientSessionId() {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing

  ensureBrowserCrypto()
  const sessionId = crypto.randomUUID()
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  return sessionId
}

export function getOrCreateActiveFlowId() {
  const existing = window.localStorage.getItem(FLOW_STORAGE_KEY)
  if (existing) return existing

  ensureBrowserCrypto()
  const flowId = crypto.randomUUID()
  window.localStorage.setItem(FLOW_STORAGE_KEY, flowId)
  return flowId
}

export function startNewFlow() {
  ensureBrowserCrypto()
  const flowId = crypto.randomUUID()
  window.localStorage.setItem(FLOW_STORAGE_KEY, flowId)
  return flowId
}

export function createRequestId() {
  ensureBrowserCrypto()
  return crypto.randomUUID()
}
