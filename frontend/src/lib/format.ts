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
  const roles = asStringArray(profile.target_roles).slice(0, 3)
  const skills = [
    ...asStringArray(profile.core_skills),
    ...asStringArray(profile.programming_languages),
    ...asStringArray(profile.frameworks_tools),
  ].slice(0, 8)

  return {
    roles,
    skills,
    summary:
      typeof profile.experience_summary === 'string' && profile.experience_summary.trim().length > 0
        ? profile.experience_summary
        : 'Resume uploaded and profile extracted. Use the dashboard to pull matching jobs and inspect fit analysis.',
  }
}

export function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
