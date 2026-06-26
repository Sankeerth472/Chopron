(async function initChopronGreenhouseAutofill() {
  const forceAutofill = new URL(window.location.href).searchParams.get('chopron_autofill') === '1'
  const isGreenhousePage = window.location.hostname === 'greenhouse.io' || window.location.hostname.endsWith('.greenhouse.io')
  const formEl = document.querySelector('form')

  if (!forceAutofill && !isGreenhousePage) return
  if (!formEl && !forceAutofill) return
  if (document.getElementById('chopron-autofill-root')) return

  const debugState = createDebugState()

  const root = document.createElement('div')
  root.id = 'chopron-autofill-root'
  root.innerHTML = `
    <style>
      #chopron-autofill-panel {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
      }
      #chopron-autofill-button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: linear-gradient(135deg, #14b8a6, #0f766e);
        color: white;
        font: 700 14px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 18px 42px -20px rgba(15, 118, 110, 0.9);
      }
      #chopron-autofill-status {
        max-width: 360px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.92);
        color: #e2e8f0;
        padding: 10px 12px;
        font: 500 12px/1.5 ui-sans-serif, system-ui, sans-serif;
        box-shadow: 0 18px 42px -28px rgba(15, 23, 42, 0.95);
      }
      #chopron-autofill-debug {
        width: 360px;
        max-width: calc(100vw - 32px);
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.92);
        color: #cbd5e1;
        box-shadow: 0 18px 42px -28px rgba(15, 23, 42, 0.95);
        overflow: hidden;
      }
      #chopron-autofill-debug summary {
        cursor: pointer;
        list-style: none;
        padding: 10px 12px;
        font: 700 12px/1.4 ui-sans-serif, system-ui, sans-serif;
      }
      #chopron-autofill-debug summary::-webkit-details-marker {
        display: none;
      }
      #chopron-autofill-debug-body {
        border-top: 1px solid rgba(148, 163, 184, 0.16);
        padding: 10px 12px 12px;
        font: 500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
        max-height: 240px;
        overflow: auto;
      }
    </style>
    <div id="chopron-autofill-panel">
      <div id="chopron-autofill-status">Chopron helper ready.</div>
      <details id="chopron-autofill-debug">
        <summary>Autofill log</summary>
        <div id="chopron-autofill-debug-body">Waiting for a run...</div>
      </details>
      <button id="chopron-autofill-button" type="button">Auto-apply</button>
    </div>
  `
  document.body.appendChild(root)

  const statusEl = root.querySelector('#chopron-autofill-status')
  const buttonEl = root.querySelector('#chopron-autofill-button')
  const debugBodyEl = root.querySelector('#chopron-autofill-debug-body')

  debugState.render = () => {
    debugBodyEl.textContent = formatDebugOutput(debugState)
  }
  debugState.render()

  buttonEl.addEventListener('click', () => {
    runAutofill({ source: 'button' })
  })

  window.setTimeout(() => {
    runAutofill({ silentIfUnconfigured: true, source: 'auto' })
  }, 650)

  function setStatus(message) {
    statusEl.textContent = message
  }

  async function runAutofill(options = {}) {
    resetDebugRun(debugState)
    pushDebugLog(debugState, 'info', 'Starting autofill run.', {
      source: options.source || 'manual',
      url: window.location.href,
    })

    try {
      if (!document.querySelector('form')) {
        const navigated = navigateToApplyForm()
        setStatus(navigated ? 'Opening the application form...' : 'Apply form not found on this page.')
        pushDebugLog(debugState, navigated ? 'info' : 'warn', 'Application form was not present on the current page.', {
          navigated,
        })
        return
      }

      setStatus('Loading your Chopron profile...')
      const config = await chrome.storage.sync.get('chopronConfig')
      if (!config.chopronConfig?.apiBaseUrl || !config.chopronConfig?.authToken) {
        if (options.silentIfUnconfigured) {
          setStatus('Configure the helper once, then Greenhouse pages will autofill automatically.')
          pushDebugLog(debugState, 'warn', 'Extension is not configured yet.')
          return
        }
        setStatus('Configure the extension first in its options page.')
        pushDebugLog(debugState, 'warn', 'Missing API configuration. Opening the options page.')
        await chrome.runtime.sendMessage({ type: 'openOptionsPage' })
        return
      }

      pushDebugLog(debugState, 'info', 'Loaded extension configuration.', {
        apiBaseUrl: config.chopronConfig.apiBaseUrl,
      })

      const payloadResult = await chrome.runtime.sendMessage({
        type: 'fetchAutofillPayload',
        apiBaseUrl: config.chopronConfig.apiBaseUrl,
        authToken: config.chopronConfig.authToken,
      })

      if (!payloadResult?.ok) {
        throw new Error(payloadResult?.error || 'Failed to load autofill payload.')
      }

      const payload = payloadResult.payload
      pushDebugLog(debugState, 'info', 'Fetched autofill payload.', {
        candidateKeys: Object.keys(payload.candidate || {}),
        customAnswerCount: Object.keys(payload.candidate?.custom_answers || {}).length,
        resumeAvailable: Boolean(payload.resume?.available),
        resumeStoragePathExists: Boolean(payload.resume?.storage_path_exists),
        resumeDownloadUrl: payload.resume?.download_url || '',
        resumeInlinePayload: Boolean(payload.resume?.inline_payload?.base64),
        profileId: payload.profile_id || null,
      })
      window.__CHOPRON_LAST_RESUME_PAYLOAD__ = payload.resume?.inline_payload || null

      const report = await fillForm(payload)
      debugState.lastRun = report
      emitRunConsoleReport(report)

      let resumeAttached = false
      if (payload.resume?.download_url) {
        resumeAttached = await attachResumeIfPossible(payload.resume.download_url, config.chopronConfig.authToken, debugState)
      } else {
        pushDebugLog(debugState, 'info', 'No resume download URL is available in the autofill payload.')
      }

      const summary = `Filled ${report.filledCount} field${report.filledCount === 1 ? '' : 's'}${resumeAttached ? ' and attached resume.' : '.'}`
      setStatus(summary)
      pushDebugLog(debugState, report.failedCount > 0 ? 'warn' : 'info', 'Autofill run completed.', {
        filledCount: report.filledCount,
        skippedCount: report.skippedCount,
        failedCount: report.failedCount,
        unmatchedCount: report.unmatchedCount,
        resumeAttached,
      })
      debugState.render()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Autofill failed.'
      setStatus(message)
      pushDebugLog(debugState, 'error', 'Autofill run failed.', { message })
    }
  }

  function navigateToApplyForm() {
    const candidates = Array.from(document.querySelectorAll('a[href], button, [role="button"]'))
    const match = candidates.find((element) => {
      const text = normalize(element.textContent || '')
      if (!text) return false
      return text === 'apply' || text === 'apply now' || text.includes('submit application')
    })

    if (!match) {
      return false
    }

    if (match instanceof HTMLAnchorElement && match.href) {
      const nextUrl = new URL(match.href, window.location.href)
      nextUrl.searchParams.set('chopron_autofill', '1')
      window.location.assign(nextUrl.toString())
      return true
    }

    match.click()
    return true
  }
})()

async function fillForm(payload) {
  const fields = Array.from(document.querySelectorAll('input, textarea, select'))
  const entries = []
  let filledCount = 0
  let skippedCount = 0
  let failedCount = 0
  let unmatchedCount = 0
  const handledRadioGroups = new Set()

  for (const field of fields) {
    const descriptor = describeField(field)
    const skipReason = getFillableSkipReason(field)

    if (skipReason) {
      entries.push({ ...descriptor, outcome: 'skipped', reason: skipReason })
      skippedCount += 1
      continue
    }

    if ((field.getAttribute('type') || '').toLowerCase() === 'radio') {
      if (handledRadioGroups.has(field.name)) {
        entries.push({ ...descriptor, outcome: 'skipped', reason: 'radio-group-already-handled' })
        skippedCount += 1
        continue
      }
      handledRadioGroups.add(field.name)
    }

    const answer = findAnswer(field, payload.candidate)
    if (!answer || answer.value === null || answer.value === undefined || answer.value === '') {
      entries.push({ ...descriptor, outcome: 'unmatched', reason: 'no-answer-found' })
      unmatchedCount += 1
      continue
    }

    const result = await applyAnswer(field, answer.value)
    if (result.ok) {
      filledCount += 1
      entries.push({
        ...descriptor,
        outcome: 'filled',
        answerKey: answer.key,
        answerSource: answer.source,
        answerPreview: truncateValue(answer.value),
        method: result.method,
        matchedOption: result.matchedOption || '',
      })
      continue
    }

    failedCount += 1
    entries.push({
      ...descriptor,
      outcome: 'failed',
      reason: result.reason || 'apply-failed',
      answerKey: answer.key,
      answerSource: answer.source,
      answerPreview: truncateValue(answer.value),
    })
  }

  return {
    startedAt: new Date().toISOString(),
    totalFields: fields.length,
    filledCount,
    skippedCount,
    failedCount,
    unmatchedCount,
    entries,
  }
}

function getFillableSkipReason(field) {
  const type = (field.getAttribute('type') || '').toLowerCase()
  if (field.disabled) return 'disabled'
  if (field.readOnly) return 'readonly'
  if (field.id && field.id.includes('__search-input')) return 'ignored-internal-search-input'
  if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') return `ignored-${type}`
  return ''
}

function findAnswer(field, candidate) {
  const context = getFieldContext(field)
  const customAnswer = findCustomAnswer(context, candidate.custom_answers || {})
  if (customAnswer) return customAnswer

  const inferredBooleanAnswer = inferBooleanAnswer(context, candidate)
  if (inferredBooleanAnswer) return inferredBooleanAnswer

  if (matches(context, ['first name', 'given name'])) return createCandidateAnswer('first_name', candidate.first_name)
  if (matches(context, ['last name', 'family name', 'surname'])) return createCandidateAnswer('last_name', candidate.last_name)
  if (matches(context, ['full name']) || exactMatch(context, 'name')) return createCandidateAnswer('full_name', candidate.full_name)
  if (matches(context, ['email'])) return createCandidateAnswer('email', candidate.email)
  if (matches(context, ['phone', 'mobile'])) return createCandidateAnswer('phone', candidate.phone)
  if (matches(context, ['linkedin'])) return createCandidateAnswer('linkedin_url', candidate.linkedin_url)
  if (matches(context, ['github'])) return createCandidateAnswer('github_url', candidate.github_url)
  if (matches(context, ['portfolio'])) return createCandidateAnswer('portfolio_url', candidate.portfolio_url || candidate.website_url)
  if (matches(context, ['website', 'personal site'])) return createCandidateAnswer('website_url', candidate.website_url || candidate.portfolio_url)
  if (matches(context, ['pronouns'])) return createCandidateAnswer('pronouns', candidate.pronouns)
  if (matches(context, ['location', 'current location', 'where are you located', 'place of residence'])) {
    return createCandidateAnswer('location', buildCandidateLocationAnswer(context, candidate))
  }
  if (matches(context, ['city', 'town'])) return createCandidateAnswer('city', candidate.city)
  if (matches(context, ['state', 'province', 'region'])) return createCandidateAnswer('state', candidate.state)
  if (matches(context, ['country', 'nation'])) return createCandidateAnswer('country', buildCountryAnswer(candidate))
  if (matches(context, ['postal', 'zip'])) return createCandidateAnswer('postal_code', candidate.postal_code)
  if (matches(context, ['work authorization', 'citizenship status', 'visa status', 'employment authorization'])) {
    return createCandidateAnswer('work_authorization', candidate.work_authorization)
  }
  if (matches(context, ['legally authorized', 'authorized to work'])) {
    return createCandidateAnswer('authorized_to_work_in_us', candidate.authorized_to_work_in_us || booleanToAnswer(!candidate.requires_sponsorship))
  }
  if (matches(context, ['sponsorship', 'require visa'])) {
    return createCandidateAnswer('requires_sponsorship', booleanToAnswer(candidate.requires_sponsorship))
  }
  if (matches(context, ['hispanic', 'latino'])) return createCandidateAnswer('hispanic_or_latino', candidate.hispanic_or_latino)
  if (matches(context, ['gender'])) return createCandidateAnswer('gender_identity', candidate.gender_identity)
  if (matches(context, ['race', 'ethnicity', 'ethnic'])) return createCandidateAnswer('race_ethnicity', candidate.race_ethnicity)
  if (matches(context, ['veteran'])) return createCandidateAnswer('veteran_status', candidate.veteran_status)
  if (matches(context, ['disability'])) return createCandidateAnswer('disability_status', candidate.disability_status)

  return null
}

function createCandidateAnswer(key, value) {
  if (value === null || value === undefined || value === '') return null
  return { key, source: 'candidate', value }
}

function buildCandidateLocation(candidate) {
  const city = String(candidate.city || '').trim()
  const state = String(candidate.state || '').trim()
  const country = String(candidate.country || '').trim()

  const primary = [city, state].filter(Boolean).join(', ')
  if (primary && country) return `${primary}, ${country}`
  return primary || country
}

function buildCandidateLocationAnswer(context, candidate) {
  const city = String(candidate.city || '').trim()
  const state = String(candidate.state || '').trim()
  const country = String(candidate.country || '').trim()

  if (matches(context, ['location city', 'locate me', 'city location'])) {
    return [city, state].filter(Boolean).join(', ') || city || buildCandidateLocation(candidate)
  }

  return buildCandidateLocation(candidate)
}

function buildCountryAnswer(candidate) {
  const country = String(candidate.country || '').trim()
  if (!country) return ''

  const normalized = normalize(country)
  if (COUNTRY_ALIASES[normalized]?.includes('united states')) {
    return 'United States'
  }

  return country
}

function inferBooleanAnswer(context, candidate) {
  if (matches(context, ['at least 18 years of age'])) {
    return { key: 'inferred_is_adult', source: 'inferred', value: 'Yes' }
  }

  if (matches(context, ['please confirm receipt', 'i understand that'])) {
    return { key: 'inferred_acknowledgement', source: 'inferred', value: 'Yes' }
  }

  if (matches(context, ['legally authorized to work in the country where this position is located'])) {
    return createCandidateAnswer('authorized_to_work_in_us', candidate.authorized_to_work_in_us || booleanToAnswer(!candidate.requires_sponsorship))
  }

  if (matches(context, ['require sponsorship for employment visa status now or in the future'])) {
    return createCandidateAnswer('requires_sponsorship', booleanToAnswer(candidate.requires_sponsorship))
  }

  return null
}

function getFieldContext(field) {
  const parts = [
    field.getAttribute('name'),
    field.getAttribute('id'),
    field.getAttribute('aria-label'),
    field.getAttribute('aria-labelledby'),
    field.getAttribute('aria-describedby'),
    field.getAttribute('placeholder'),
    field.getAttribute('data-qa'),
    field.getAttribute('data-testid'),
    field.getAttribute('autocomplete'),
    findLabelText(field),
    findLegendText(field),
    findNearbyText(field),
  ]
  return normalize(parts.filter(Boolean).join(' | '))
}

function findLabelText(field) {
  const id = field.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent) return label.textContent
  }
  const closestLabel = field.closest('label')
  return closestLabel?.textContent || ''
}

function findLegendText(field) {
  const fieldset = field.closest('fieldset')
  const legend = fieldset?.querySelector('legend')
  return legend?.textContent || ''
}

function findNearbyText(field) {
  const container = field.closest('[class*="field"], [class*="question"], [data-qa], .application-question, .question') || field.parentElement
  return container?.textContent || ''
}

function findCustomAnswer(context, customAnswers) {
  for (const [question, answer] of Object.entries(customAnswers)) {
    if (context.includes(normalize(question))) {
      return { key: question, source: 'custom', value: answer }
    }
  }
  return null
}

function matches(context, patterns) {
  return patterns.some((pattern) => context.includes(normalize(pattern)))
}

function exactMatch(context, pattern) {
  return context === normalize(pattern)
}

function booleanToAnswer(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return ''
}

async function applyAnswer(field, answer) {
  const tagName = field.tagName.toLowerCase()
  const type = (field.getAttribute('type') || '').toLowerCase()

  if (tagName === 'select') {
    return setSelectValue(field, answer)
  }

  if (isComboboxField(field)) {
    return setComboboxValue(field, answer)
  }

  if (type === 'radio') {
    return setRadioValue(field.name, answer)
  }

  if (type === 'checkbox') {
    return setCheckboxValue(field, answer)
  }

  field.focus()
  field.value = String(answer)
  dispatchFieldEvents(field)
  commitFieldValue(field)
  return { ok: true, method: 'value' }
}

function setSelectValue(field, answer) {
  const normalizedAnswerVariants = getAnswerVariants(answer)
  const options = Array.from(field.options).filter((option) => normalize(option.value || option.textContent || ''))
  let bestMatch = null

  for (const option of options) {
    const optionVariants = getOptionVariants(option)
    const score = scoreOptionMatch(normalizedAnswerVariants, optionVariants)
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { option, score }
    }
  }

  if (!bestMatch || bestMatch.score <= 0) {
    return { ok: false, reason: 'no-select-option-match' }
  }

  field.value = bestMatch.option.value
  dispatchFieldEvents(field)
  commitFieldValue(field)
  return {
    ok: true,
    method: 'select',
    matchedOption: truncateValue(bestMatch.option.textContent || bestMatch.option.value),
  }
}

async function setComboboxValue(field, answer) {
  const answerText = buildComboboxSearchText(field, answer)
  if (!answerText) {
    return { ok: false, reason: 'empty-combobox-answer' }
  }

  field.focus()
  field.click()
  field.value = answerText
  dispatchFieldEvents(field)
  commitFieldValue(field)
  dispatchKeyboardEvent(field, 'keydown', 'ArrowDown')
  dispatchKeyboardEvent(field, 'keyup', 'ArrowDown')
  await wait(150)

  const optionMatch = findBestInteractiveOption(answerText)
  if (optionMatch) {
    optionMatch.scrollIntoView({ block: 'nearest' })
    optionMatch.click()
    dispatchFieldEvents(field)
    commitFieldValue(field)
    return {
      ok: true,
      method: 'combobox-option',
      matchedOption: truncateValue(optionMatch.textContent || optionMatch.getAttribute('aria-label') || answerText),
    }
  }

  dispatchKeyboardEvent(field, 'keydown', 'Enter')
  dispatchKeyboardEvent(field, 'keyup', 'Enter')
  dispatchFieldEvents(field)
  commitFieldValue(field)
  return { ok: true, method: 'combobox-enter', matchedOption: truncateValue(answerText) }
}

function buildComboboxSearchText(field, answer) {
  const rawAnswer = String(answer || '').trim()
  if (!rawAnswer) return ''

  const context = getFieldContext(field)

  if (matches(context, ['location city', 'locate me', 'city location'])) {
    return rawAnswer.split(',')[0].trim()
  }

  if (matches(context, ['country'])) {
    return rawAnswer
  }

  if (matches(context, [
    'at least 18 years of age',
    'please confirm receipt',
    'i understand that',
    'legally authorized',
    'require sponsorship',
    'government official',
    'close relative',
    'conflict of interest',
  ])) {
    const normalized = normalize(rawAnswer)
    if (normalized === 'yes' || normalized === 'no') {
      return normalized === 'yes' ? 'Yes' : 'No'
    }
  }

  return rawAnswer
}

function getOptionVariants(option) {
  return getAnswerVariants(`${option.textContent || ''} ${option.value || ''}`)
}

function scoreOptionMatch(answerVariants, optionVariants) {
  for (const answerVariant of answerVariants) {
    for (const optionVariant of optionVariants) {
      if (!answerVariant || !optionVariant) continue
      if (answerVariant === optionVariant) return 100
      if (optionVariant.includes(answerVariant) || answerVariant.includes(optionVariant)) return 75
      if (shareSignificantTokens(answerVariant, optionVariant)) return 50
    }
  }
  return 0
}

function shareSignificantTokens(left, right) {
  const leftTokens = left.split(' ').filter((token) => token.length > 1)
  const rightTokens = new Set(right.split(' ').filter((token) => token.length > 1))
  return leftTokens.length > 0 && leftTokens.every((token) => rightTokens.has(token))
}

function setRadioValue(groupName, answer) {
  if (!groupName) return { ok: false, reason: 'missing-radio-group-name' }

  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(groupName)}"]`))
  const answerVariants = getAnswerVariants(answer)
  let match = null

  for (const radio of radios) {
    const variants = getAnswerVariants(`${findLabelText(radio)} ${radio.value}`)
    const score = scoreOptionMatch(answerVariants, variants)
    if (!match || score > match.score) {
      match = { radio, score }
    }
  }

  if (!match || match.score <= 0) {
    return { ok: false, reason: 'no-radio-option-match' }
  }

  match.radio.checked = true
  dispatchFieldEvents(match.radio)
  return { ok: true, method: 'radio', matchedOption: truncateValue(findLabelText(match.radio) || match.radio.value) }
}

function setCheckboxValue(field, answer) {
  const normalizedAnswer = normalize(String(answer))
  if (!['yes', 'true'].includes(normalizedAnswer)) {
    return { ok: false, reason: 'checkbox-answer-not-truthy' }
  }
  field.checked = true
  dispatchFieldEvents(field)
  return { ok: true, method: 'checkbox' }
}

async function attachResumeIfPossible(downloadUrl, authToken, debugState) {
  const fileInput = findResumeFileInput()

  if (!fileInput) {
    pushDebugLog(debugState, 'warn', 'Resume upload field was not found on the page.')
    return false
  }

  let resumePayload = window.__CHOPRON_LAST_RESUME_PAYLOAD__ || null

  if (!resumePayload?.base64 && downloadUrl) {
    const result = await chrome.runtime.sendMessage({
      type: 'fetchResumeFile',
      url: downloadUrl,
      authToken,
    })

    if (!result?.ok) {
      pushDebugLog(debugState, 'warn', 'Resume download failed.', { error: result?.error || 'unknown' })
      return false
    }

    resumePayload = result.payload
  }

  if (!resumePayload?.base64) {
    pushDebugLog(debugState, 'warn', 'No resume payload was available to attach.')
    return false
  }

  const file = base64ToFile(
    resumePayload.base64,
    resumePayload.filename || 'resume.pdf',
    resumePayload.mimeType || resumePayload.mime_type || 'application/pdf',
  )
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)
  fileInput.files = dataTransfer.files
  dispatchFieldEvents(fileInput)
  pushDebugLog(debugState, 'info', 'Attached stored resume file.', {
    filename: file.name,
    source: window.__CHOPRON_LAST_RESUME_PAYLOAD__?.base64 ? 'inline-payload' : 'download',
  })
  return true
}

function base64ToFile(base64, filename, mimeType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], filename, { type: mimeType })
}

function dispatchFieldEvents(field) {
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
  field.dispatchEvent(new Event('blur', { bubbles: true }))
}

function commitFieldValue(field) {
  dispatchKeyboardEvent(field, 'keydown', 'Enter')
  dispatchKeyboardEvent(field, 'keyup', 'Enter')
}

function dispatchKeyboardEvent(field, type, key) {
  field.dispatchEvent(new KeyboardEvent(type, {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
  }))
}

function describeField(field) {
  return {
    tag: field.tagName.toLowerCase(),
    type: (field.getAttribute('type') || '').toLowerCase() || field.tagName.toLowerCase(),
    name: field.getAttribute('name') || '',
    id: field.getAttribute('id') || '',
    context: getFieldContext(field),
  }
}

function isComboboxField(field) {
  const role = (field.getAttribute('role') || '').toLowerCase()
  const ariaAutocomplete = (field.getAttribute('aria-autocomplete') || '').toLowerCase()
  const list = field.getAttribute('list')
  const type = (field.getAttribute('type') || '').toLowerCase()
  const context = getFieldContext(field)
  const hasPopup = field.getAttribute('aria-haspopup')
  const expanded = field.getAttribute('aria-expanded')
  return role === 'combobox'
    || Boolean(list)
    || ariaAutocomplete === 'list'
    || ariaAutocomplete === 'both'
    || hasPopup === 'listbox'
    || expanded === 'false'
    || expanded === 'true'
    || ((type === 'text' || type === 'search') && field.id.startsWith('question_'))
    || ((type === 'text' || type === 'search') && matches(context, [
      'how did you hear about this job',
      'which of the following',
      'are you legally authorized',
      'will you require sponsorship',
      'gender',
      'hispanic ethnicity',
      'veteran status',
      'disability status',
      'at least 18 years of age',
      'previously been employed',
      'government official',
      'conflict of interest',
    ]))
}

function findBestInteractiveOption(answer) {
  const answerVariants = getAnswerVariants(answer)
  const candidates = Array.from(document.querySelectorAll([
    '[role="option"]',
    '[role="listbox"] [role="presentation"]',
    '[role="listbox"] li',
    '[role="menu"] [role="menuitem"]',
    'li[data-value]',
    '.select__option',
    '.react-select__option',
  ].join(', '))).filter((element) => {
    const text = normalize(element.textContent || element.getAttribute('aria-label') || '')
    return Boolean(text) && isElementVisible(element)
  })

  let bestMatch = null
  for (const candidate of candidates) {
    const variants = getAnswerVariants(candidate.textContent || candidate.getAttribute('aria-label') || '')
    const score = scoreOptionMatch(answerVariants, variants)
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { element: candidate, score }
    }
  }

  return bestMatch && bestMatch.score > 0 ? bestMatch.element : null
}

function isElementVisible(element) {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
}

function findResumeFileInput() {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
  if (inputs.length === 0) return null

  const contextualMatch = inputs.find((input) => {
    const context = normalize([
      getFieldContext(input),
      input.closest('label, fieldset, section, div')?.textContent || '',
      input.parentElement?.textContent || '',
    ].join(' | '))
    return matches(context, ['resume', 'cv', 'attach resume', 'upload resume'])
  })

  if (contextualMatch) return contextualMatch
  if (inputs.length === 1) return inputs[0]
  return null
}

function getAnswerVariants(answer) {
  const base = normalize(String(answer || ''))
  const variants = new Set([base])

  const stateAlias = STATE_ALIASES[base]
  if (stateAlias) {
    variants.add(stateAlias)
  }

  if (COUNTRY_ALIASES[base]) {
    for (const alias of COUNTRY_ALIASES[base]) {
      variants.add(alias)
    }
  }

  if (base === 'yes' || base === 'true') {
    variants.add('yes')
    variants.add('true')
    variants.add('authorized')
  }

  if (base === 'no' || base === 'false') {
    variants.add('no')
    variants.add('false')
    variants.add('not authorized')
  }

  return Array.from(variants).filter(Boolean)
}

function truncateValue(value) {
  const text = String(value || '').trim()
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function createDebugState() {
  const state = {
    logs: [],
    lastRun: null,
    render: () => {},
  }

  return state
}

function resetDebugRun(debugState) {
  debugState.lastRun = null
}

function pushDebugLog(debugState, level, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  }

  debugState.logs.push(entry)
  if (debugState.logs.length > 200) {
    debugState.logs.shift()
  }

  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  logger('[Chopron Autofill]', message, data)
  debugState.render()
}

function emitRunConsoleReport(report) {
  const summary = {
    filledCount: report.filledCount,
    skippedCount: report.skippedCount,
    failedCount: report.failedCount,
    unmatchedCount: report.unmatchedCount,
    totalFields: report.totalFields,
  }

  console.groupCollapsed('[Chopron Autofill] Field report')
  console.table(report.entries)
  console.log('summary', summary)
  console.groupEnd()
}

function formatDebugOutput(debugState) {
  const lines = []

  if (debugState.lastRun) {
    lines.push(`Last run: filled=${debugState.lastRun.filledCount} unmatched=${debugState.lastRun.unmatchedCount} failed=${debugState.lastRun.failedCount} skipped=${debugState.lastRun.skippedCount}`)
    const recentEntries = debugState.lastRun.entries
      .filter((entry) => entry.outcome !== 'skipped')
      .slice(-8)

    for (const entry of recentEntries) {
      const details = [entry.context || entry.name || entry.id || entry.tag, entry.reason || entry.answerKey || '']
        .filter(Boolean)
        .join(' | ')
      lines.push(`${entry.outcome.toUpperCase()}: ${details}`)
    }
  }

  const recentLogs = debugState.logs.slice(-8)
  if (recentLogs.length) {
    if (lines.length) lines.push('')
    lines.push('Recent logs:')
    for (const log of recentLogs) {
      lines.push(`${log.level.toUpperCase()}: ${log.message}`)
    }
  }

  return lines.join('\n') || 'Waiting for a run...'
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STATE_ALIASES = {
  alabama: 'al',
  alaska: 'ak',
  arizona: 'az',
  arkansas: 'ar',
  california: 'ca',
  colorado: 'co',
  connecticut: 'ct',
  delaware: 'de',
  florida: 'fl',
  georgia: 'ga',
  hawaii: 'hi',
  idaho: 'id',
  illinois: 'il',
  indiana: 'in',
  iowa: 'ia',
  kansas: 'ks',
  kentucky: 'ky',
  louisiana: 'la',
  maine: 'me',
  maryland: 'md',
  massachusetts: 'ma',
  michigan: 'mi',
  minnesota: 'mn',
  mississippi: 'ms',
  missouri: 'mo',
  montana: 'mt',
  nebraska: 'ne',
  nevada: 'nv',
  'new hampshire': 'nh',
  'new jersey': 'nj',
  'new mexico': 'nm',
  'new york': 'ny',
  'north carolina': 'nc',
  'north dakota': 'nd',
  ohio: 'oh',
  oklahoma: 'ok',
  oregon: 'or',
  pennsylvania: 'pa',
  'rhode island': 'ri',
  'south carolina': 'sc',
  'south dakota': 'sd',
  tennessee: 'tn',
  texas: 'tx',
  utah: 'ut',
  vermont: 'vt',
  virginia: 'va',
  washington: 'wa',
  'west virginia': 'wv',
  wisconsin: 'wi',
  wyoming: 'wy',
  dc: 'district of columbia',
  'district of columbia': 'dc',
}

const COUNTRY_ALIASES = {
  us: ['us', 'usa', 'united states', 'united states of america'],
  usa: ['us', 'usa', 'united states', 'united states of america'],
  'united states': ['us', 'usa', 'united states', 'united states of america'],
  'united states of america': ['us', 'usa', 'united states', 'united states of america'],
}

for (const [left, right] of Object.entries(STATE_ALIASES)) {
  if (!STATE_ALIASES[right]) {
    STATE_ALIASES[right] = left
  }
}
