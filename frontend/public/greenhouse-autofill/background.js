chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'openOptionsPage') {
    openExtensionOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type === 'fetchAutofillPayload') {
    fetchJson(`${message.apiBaseUrl.replace(/\/$/, '')}/profile/autofill-payload`, message.authToken)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type === 'fetchResumeFile') {
    fetchFile(message.url, message.authToken)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type === 'testConnection') {
    fetchJson(`${message.apiBaseUrl.replace(/\/$/, '')}/profile/autofill-settings`, message.authToken)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  return false
})

async function openExtensionOptionsPage() {
  if (typeof chrome.runtime.openOptionsPage === 'function') {
    await chrome.runtime.openOptionsPage()
    return
  }

  const optionsUrl = chrome.runtime.getURL('options.html')

  if (chrome.tabs?.create) {
    await chrome.tabs.create({ url: optionsUrl })
    return
  }

  if (globalThis.clients?.openWindow) {
    await globalThis.clients.openWindow(optionsUrl)
    return
  }

  throw new Error('Unable to open the extension options page in this browser.')
}

async function fetchJson(url, authToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`)
  }
  return response.json()
}

async function fetchFile(url, authToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Resume download failed with status ${response.status}.`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return {
    base64: btoa(binary),
    mimeType: response.headers.get('content-type') || 'application/pdf',
    filename: readFilename(response.headers.get('content-disposition')) || 'resume.pdf',
  }
}

function readFilename(contentDisposition) {
  if (!contentDisposition) return null
  const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/)
  return match ? match[1] : null
}
