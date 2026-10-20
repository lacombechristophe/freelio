import { describe, expect, it } from "vitest"
import { EmailProviderError, retryAfterDate, throwEmailProviderFailure } from "@/lib/communications/provider-errors"

const now = new Date("2035-01-02T12:00:00Z")
function failure(provider: string, status: number, payload: unknown = {}, after?: string) {
  try { throwEmailProviderFailure(provider, new Response(null, { status, headers: after ? { "retry-after": after } : {} }), payload, now) }
  catch (error) { return error as EmailProviderError }
}
describe("provider HTTP failure classification", () => {
  it.each(["RESEND", "GOOGLE", "MICROSOFT"])("respects a %s rate-limit deadline without trusting its message", provider => {
    const error = failure(provider, 429, { message: "hidden@example.test", error: { message: "private_token" } }, "3600")
    expect(error).toBeInstanceOf(EmailProviderError)
    expect(error).toMatchObject({ kind: "THROTTLED", retryAt: new Date("2035-01-02T13:00:00Z") })
    expect(error.message).not.toMatch(/hidden|private_token/)
  })
  it.each(["rateLimitExceeded", "userRateLimitExceeded"])("distinguishes Gmail 403 %s from missing authorization", reason => {
    expect(failure("GOOGLE", 403, { error: { errors: [{ reason }] } })).toMatchObject({ kind: "THROTTLED", retryAt: new Date("2035-01-02T12:05:00Z") })
  })
  it("does not classify an unknown/mixed Gmail permission failure as a rate limit", () => {
    expect(failure("GOOGLE", 403, { error: { errors: [{ reason: "rateLimitExceeded" }, { reason: "domainPolicy" }] } }).kind).toBe("AUTH")
  })
  it.each([401, 403, 400, 422])("stops a request requiring intervention (%i)", status => {
    expect(failure("RESEND", status).kind).toBe(status === 401 || status === 403 ? "AUTH" : "PERMANENT")
  })
  it("waits until the documented next UTC day for a Resend daily limit", () => {
    expect(failure("RESEND", 429, { name: "daily_quota_exceeded" }, "10")).toMatchObject({ kind: "THROTTLED", retryAt: new Date("2035-01-03T00:00:00Z") })
  })
  it("does not invent a reset date or upgrade a monthly account allowance", () => {
    expect(failure("RESEND", 429, { name: "monthly_quota_exceeded" })).toMatchObject({ kind: "CONFIGURATION", retryAt: null })
    expect(failure("GOOGLE", 403, { error: { errors: [{ reason: "dailyLimitExceeded" }] } }).kind).toBe("CONFIGURATION")
  })
  it.each([500, 502, 503, 504])("keeps server failure %i uncertain and retains its wait hint", status => {
    expect(failure("MICROSOFT", status, {}, "3600")).toMatchObject({ kind: "TRANSIENT", retryAt: new Date("2035-01-02T13:00:00Z") })
  })
  it.each([404, 409])("leaves HTTP %i unclassified rather than claiming non-send", status => {
    const error = failure("RESEND", status, { message: "private@example.test" })
    expect(error).not.toBeInstanceOf(EmailProviderError)
    expect(error.message).toContain("résultat de l’envoi à vérifier")
    expect(error.message).not.toContain("private@example.test")
  })
  it("accepts an HTTP date without timezone drift", () => {
    expect(retryAfterDate("Tue, 02 Jan 2035 14:00:00 GMT", now)).toEqual(new Date("2035-01-02T14:00:00Z"))
  })
  it.each([null, "", "-1", "1e4", "Infinity", "nonsense", "Wed, 01 Jan 2020 12:00:00 GMT", "9".repeat(400)])("rejects an invalid or past Retry-After: %s", after => {
    expect(retryAfterDate(after, now)).toBeNull()
  })
})
