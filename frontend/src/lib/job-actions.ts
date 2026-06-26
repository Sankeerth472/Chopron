export function canAutoApplyJob(source: string, url: string | null | undefined) {
  return source === 'greenhouse' && Boolean(url)
}

export function openJobForAutofill(url: string) {
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('chopron_autofill', '1')
  window.open(nextUrl.toString(), '_blank', 'noopener,noreferrer')
}
