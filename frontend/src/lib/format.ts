const ROLE_KEYWORDS = ['engineer', 'developer', 'scientist', 'analyst', 'architect']
const EDUCATION_KEYWORDS = ['university', 'college', 'bachelor', 'master', 'phd', 'b.s', 'b.a', 'm.s', 'm.a']
const NOISE_PATTERNS = ['github', 'linkedin', '@', '|', 'summary']
const UPPERCASE_TOKENS = new Set(['ai', 'ml', 'llm', 'nlp', 'sql', 'aws', 'gcp', 'api', 'apis', 'rag', 'ci/cd'])

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isNoiseLine(value: string) {
  const normalized = value.toLowerCase()
  return NOISE_PATTERNS.some((pattern) => normalized.includes(pattern))
}

function formatDisplayText(value: string) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .map((word) => {
      const normalized = word.toLowerCase()
      if (UPPERCASE_TOKENS.has(normalized)) return normalized.toUpperCase()
      if (normalized.includes('/')) {
        return normalized
          .split('/')
          .map((part) => (UPPERCASE_TOKENS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
          .join('/')
      }
      return normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join(' ')
}

function joinWithAnd(values: string[]) {
  if (values.length <= 1) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

export function getDisplayRoles(profile: Record<string, unknown>) {
  return uniqueStrings(asStringArray(profile.target_roles))
    .map(normalizeWhitespace)
    .filter((role) => {
      const normalized = role.toLowerCase()
      if (!normalized) return false
      if (isNoiseLine(role)) return false
      if (normalized.includes('india') || normalized.includes('usa')) return false
      if (normalized.includes(', fl') || normalized.includes(', tx') || normalized.includes(', ca')) return false
      return ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword))
    })
    .slice(0, 3)
}

export function getDisplayEducation(profile: Record<string, unknown>) {
  const education = asStringArray(profile.education)
    .map(normalizeWhitespace)
    .filter((item) => {
      const normalized = item.toLowerCase()
      if (!normalized) return false
      if (isNoiseLine(item)) return false
      return EDUCATION_KEYWORDS.some((keyword) => normalized.includes(keyword))
    })

  const fallbackSummary = normalizeWhitespace(
    [asStringArray(profile.education).find((item) => item.toLowerCase().includes('master')),
      asStringArray(profile.education).find((item) => item.toLowerCase().includes('bachelor')),
      asStringArray(profile.education).find((item) => item.toLowerCase().includes('university') || item.toLowerCase().includes('college'))]
      .filter((item): item is string => Boolean(item))
      .join(' '),
  )

  const result = uniqueStrings(education)
  if (result.length > 0) return result.slice(0, 3)
  return fallbackSummary ? [fallbackSummary] : []
}

export function getDisplaySummary(profile: Record<string, unknown>) {
  const rawSummary = typeof profile.experience_summary === 'string' ? normalizeWhitespace(profile.experience_summary) : ''
  const roles = getDisplayRoles(profile)
  const domains = asStringArray(profile.domains).slice(0, 3)
  const skills = uniqueStrings([
    ...asStringArray(profile.programming_languages),
    ...asStringArray(profile.frameworks_tools),
    ...asStringArray(profile.core_skills),
  ]).slice(0, 4)

  if (rawSummary && !isNoiseLine(rawSummary) && rawSummary.length > 40) {
    return rawSummary
  }

  const formattedRoles = roles.map(formatDisplayText)
  const formattedDomains = domains.map((domain) => domain.toLowerCase())
  const formattedSkills = skills.map(formatDisplayText)
  const roleText = formattedRoles.length > 0 ? joinWithAnd(formattedRoles) : 'Candidate'
  const domainText = formattedDomains.length > 0 ? `focused on ${joinWithAnd(formattedDomains)} domains` : 'with an extracted technical profile'
  const skillText = formattedSkills.length > 0 ? `Core stack includes ${joinWithAnd(formattedSkills)}.` : ''
  return `${roleText} ${domainText}. ${skillText}`.trim()
}

export function formatDate(value?: string | null) {
  if (!value) return 'Unknown date'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

export function formatScore(value?: number | null) {
  if (value === null || value === undefined) return 'N/A'
  return `${Math.max(0, Math.min(100, value))}%`
}

export function toTitleCase(value?: string | null) {
  if (!value) return 'Unknown'
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function summarizeProfile(profile: Record<string, unknown>) {
  const roles = getDisplayRoles(profile)
  const skills = uniqueStrings([
    ...asStringArray(profile.core_skills),
    ...asStringArray(profile.programming_languages),
    ...asStringArray(profile.frameworks_tools),
  ]).map(normalizeWhitespace).filter((skill) => !isNoiseLine(skill)).slice(0, 8)

  return {
    roles,
    skills,
    summary: getDisplaySummary(profile),
  }
}

export function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      }
    } catch {
      return [trimmed]
    }

    return [trimmed]
  }

  return []
}
