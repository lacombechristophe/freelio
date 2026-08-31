import { afterEach, describe, expect, it } from "vitest"

import { cronRequestIsAuthorized } from "@/lib/cron-auth"

const previousSecret = process.env.CRON_SECRET

afterEach(() => { process.env.CRON_SECRET = previousSecret })

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
})
