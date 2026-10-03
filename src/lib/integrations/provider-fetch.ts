// A deadline covers both headers and consumption of the response body. Never
// follow redirects with OAuth/API credentials or retry a remote mutation here.
export function providerFetch(input: string | URL, init: RequestInit = {}, timeoutMs = 30_000) {
  const deadline = AbortSignal.timeout(timeoutMs)
  return globalThis.fetch(input, { ...init, redirect: "error", signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline })
}

export function safeMicrosoftContinuation(value: string) {
  const url = new URL(value)
  if (value.length > 20_000 || url.origin !== "https://graph.microsoft.com" || url.username || url.password || url.hash || !url.pathname.startsWith("/v1.0/me/")) throw new Error("Curseur Microsoft invalide")
  return url.toString()
}
