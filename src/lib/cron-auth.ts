import { createHash, timingSafeEqual } from "node:crypto"

function digest(value: string) {
  return createHash("sha256").update(value).digest()
}

export function cronRequestIsAuthorized(request: Request, ...fallbackNames: string[]) {
  const names = ["CRON_SECRET", ...fallbackNames]
  const expected = names.map((name) => process.env[name]?.trim()).find(Boolean)
  if (!expected) return false
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || ""
  return timingSafeEqual(digest(expected), digest(provided))
}
