const setupJsonInput = document.getElementById('setup-json')
const apiBaseUrlInput = document.getElementById('api-base-url')
const authTokenInput = document.getElementById('auth-token')
const saveButton = document.getElementById('save-button')
const testButton = document.getElementById('test-button')
const statusEl = document.getElementById('status')

loadConfig()

setupJsonInput.addEventListener('input', () => {
  const raw = setupJsonInput.value.trim()
  if (!raw) return

  try {
    const parsed = JSON.parse(raw)
    apiBaseUrlInput.value = parsed.apiBaseUrl || ''
    authTokenInput.value = parsed.authToken || ''
    setStatus('Setup JSON parsed. Save it to finish configuration.', false)
  } catch {
    setStatus('Setup JSON is not valid yet.', true)
  }
})

saveButton.addEventListener('click', async () => {
  const config = readConfig()
  if (!config) return
  await chrome.storage.sync.set({ chopronConfig: config })
  setStatus('Saved. The helper is ready on Greenhouse pages.', false)
})

testButton.addEventListener('click', async () => {
  const config = readConfig()
  if (!config) return
  setStatus('Testing connection...', false)
  const result = await chrome.runtime.sendMessage({
    type: 'testConnection',
    apiBaseUrl: config.apiBaseUrl,
    authToken: config.authToken,
  })
  setStatus(result?.ok ? 'Connection successful.' : result?.error || 'Connection failed.', !result?.ok)
})

async function loadConfig() {
  const stored = await chrome.storage.sync.get('chopronConfig')
  const config = stored.chopronConfig
  if (!config) return
  apiBaseUrlInput.value = config.apiBaseUrl || ''
  authTokenInput.value = config.authToken || ''
}

function readConfig() {
  const apiBaseUrl = apiBaseUrlInput.value.trim()
  const authToken = authTokenInput.value.trim()

  if (!apiBaseUrl || !authToken) {
    setStatus('Both API base URL and auth token are required.', true)
    return null
  }

  return { apiBaseUrl, authToken }
}

function setStatus(message, isError) {
  statusEl.textContent = message
  statusEl.style.color = isError ? '#fda4af' : '#5eead4'
}
