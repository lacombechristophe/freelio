import { afterEach, describe, expect, it } from "vitest"

import { cronRequestIsAuthorized } from "@/lib/cron-auth"

const previousSecret = process.env.CRON_SECRET
const previousAutomationSecret = process.env.AUTOMATION_CRON_SECRET

afterEach(() => {
  process.env.CRON_SECRET = previousSecret
  process.env.AUTOMATION_CRON_SECRET = previousAutomationSecret
})

describe("cron authorization", () => {
  it("accepts Vercel bearer authorization", () => {
    process.env.CRON_SECRET = "s".repeat(32)
    const request = new Request("https://example.test/api/process", { headers: { authorization: `Bearer ${"s".repeat(32)}` } })
    expect(cronRequestIsAuthorized(request)).toBe(true)
  })

  it("rejects missing and different credentials", () => {
    process.env.CRON_SECRET = "s".repeat(32)
    expect(cronRequestIsAuthorized(new Request("https://example.test/api/process"))).toBe(false)
    expect(cronRequestIsAuthorized(new Request("https://example.test/api/process", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).toBe(false)
  })

  it("accepts a route-specific secret even when the global secret is configured", () => {
    process.env.CRON_SECRET = "global-secret".repeat(3)
    process.env.AUTOMATION_CRON_SECRET = "automation-secret".repeat(3)
    const request = new Request("https://example.test/api/automations/process", { headers: { authorization: `Bearer ${process.env.AUTOMATION_CRON_SECRET}` } })
    expect(cronRequestIsAuthorized(request, "AUTOMATION_CRON_SECRET")).toBe(true)
  })
})
