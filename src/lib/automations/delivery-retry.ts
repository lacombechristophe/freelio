const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const

export function nextDeliveryRetry(input: { attempts: number; maxAttempts: number; now?: Date }) {
  const attempts = Math.max(0, Math.trunc(input.attempts))
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts))
  if (attempts >= maxAttempts) return { deadLetter: true as const, nextAttemptAt: null }
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(0, attempts - 1), RETRY_DELAYS_MS.length - 1)]
  return { deadLetter: false as const, nextAttemptAt: new Date((input.now ?? new Date()).getTime() + delay) }
}
