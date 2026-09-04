import { createHash, timingSafeEqual } from "node:crypto"

function digest(value: string) {
  return createHash("sha256").update(value).digest()
}

export function cronRequestIsAuthorized(request: Request, ...fallbackNames: string[]) {
  const names = ["CRON_SECRET", ...fallbackNames]
  const expected = names.map((name) => process.env[name]?.trim()).filter((value): value is string => Boolean(value))
  if (!expected.length) return false
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || ""
  const providedDigest = digest(provided)
  return expected.some((secret) => timingSafeEqual(digest(secret), providedDigest))
}
