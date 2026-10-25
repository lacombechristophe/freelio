export type EmailProviderFailureKind = "THROTTLED" | "AUTH" | "PERMANENT" | "CONFIGURATION" | "TRANSIENT"

export class EmailProviderError extends Error {
  constructor(readonly kind: EmailProviderFailureKind, readonly provider: string, readonly status: number, readonly retryAt: Date | null = null) {
    super(kind === "THROTTLED" ? "Le fournisseur limite les envois ; une reprise différée est nécessaire"
      : kind === "AUTH" ? "Autorisation du fournisseur refusée ; vérifiez ou reconnectez la boîte"
      : kind === "PERMANENT" ? "Le fournisseur refuse cette demande ; corrigez le contenu ou la configuration avant un nouvel envoi"
      : kind === "CONFIGURATION" ? "Quota fournisseur indisponible ; vérifiez les limites du compte avant toute reprise"
      : "Le fournisseur est temporairement indisponible ; le résultat de l’envoi reste à vérifier")
  }
}

export class EmailProviderWaitError extends Error {
  constructor(readonly retryAt: Date) { super(`Reprise fournisseur différée jusqu’au ${retryAt.toISOString()} ; aucun nouvel appel effectué`) }
}

export function terminalProviderFailure(kind: string | null | undefined) {
  return kind === "AUTH" || kind === "PERMANENT" || kind === "CONFIGURATION"
}

export function providerRetryDate(error: EmailProviderError, fallback: Date) {
  return error.retryAt && error.retryAt > fallback ? error.retryAt : fallback
}

export function retryAfterDate(value: string | null, now = new Date()) {
  if (!value) return null
  const text = value.trim()
  const timestamp = /^\d+$/.test(text) ? now.getTime() + Number(text) * 1_000
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text) ? Date.parse(text) : NaN
  return Number.isFinite(timestamp) && timestamp >= now.getTime() && timestamp <= 253402300799000 ? new Date(timestamp) : null
}

/** Classify explicit HTTP failures only. Network/timeout and malformed success remain uncertain. */
export function throwEmailProviderFailure(provider: string, response: Response, payload: unknown, now = new Date()): never {
  const object = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const detail = object.error && typeof object.error === "object" ? object.error as Record<string, unknown> : {}
  const reasons = Array.isArray(detail.errors) ? detail.errors.flatMap(error => error && typeof error === "object" && "reason" in error && typeof error.reason === "string" ? [error.reason] : []) : []
  const retryAt = retryAfterDate(response.headers.get("retry-after"), now)
  const googleRate = provider === "GOOGLE" && response.status === 403 && reasons.length > 0 && reasons.every(reason => ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason))
  if (response.status === 429 || googleRate) {
    if (provider === "RESEND" && object.name === "monthly_quota_exceeded") throw new EmailProviderError("CONFIGURATION", provider, response.status)
    const daily = provider === "RESEND" && object.name === "daily_quota_exceeded"
    const fallback = daily ? new Date((Math.floor(now.getTime() / 86_400_000) + 1) * 86_400_000) : new Date(now.getTime() + 5 * 60_000)
    throw new EmailProviderError("THROTTLED", provider, response.status, retryAt && retryAt > fallback ? retryAt : fallback)
  }
  if (provider === "GOOGLE" && response.status === 403 && reasons.includes("dailyLimitExceeded")) throw new EmailProviderError("CONFIGURATION", provider, response.status)
  if ([401, 403].includes(response.status)) throw new EmailProviderError("AUTH", provider, response.status)
  if ([400, 422].includes(response.status)) throw new EmailProviderError("PERMANENT", provider, response.status)
  if (response.status >= 500 && response.status <= 599) throw new EmailProviderError("TRANSIENT", provider, response.status, retryAt)
  // In particular, 404/409 may follow a previous accepted attempt. Never assert non-send.
  throw new Error(`Réponse ${provider} inattendue (${response.status}) ; résultat de l’envoi à vérifier`)
}
