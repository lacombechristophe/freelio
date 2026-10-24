import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Redis } from "@upstash/redis"

const sdk = vi.hoisted(() => ({ check: vi.fn(), connections: vi.fn() }))
vi.mock("@upstash/redis", () => ({ Redis: class { constructor(config: unknown) { sdk.connections(config) } static fromEnv() { return {} } } }))
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {} } limit = sdk.check } }))

const allowed = { success: true, limit: 5, remaining: 4, reset: 50_000, pending: Promise.resolve() }
const load = () => import("@/lib/rate-limit")

beforeEach(() => {
  vi.resetModules()
  sdk.check.mockReset().mockResolvedValue(allowed)
  sdk.connections.mockReset()
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("GITHUB_ACTIONS", "")
  vi.stubEnv("RECIPE_ISOLATED", "")
  vi.stubEnv("E2E_ENABLE_CREDENTIALS_AUTH", "")
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fictional-token")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules() })

describe("Distributed rate-limit decisions", () => {
  it.each(["authRateLimit", "passwordResetRateLimit", "apiRateLimit", "signatureRateLimit", "leadRateLimit", "consentRateLimit", "portalRateLimit", "automationProcessRateLimit"] as const)("refuses %s when the SDK permits a timed-out check", async name => {
    sdk.check.mockResolvedValue({ ...allowed, reason: "timeout", limit: 0, remaining: 0, reset: 0 })
    const limiter = (await load())[name]
    expect(await limiter.limit("fictional-recipient")).toMatchObject({ success: false, remaining: 0 })
  })

  it("retains an actual allowance and a cached quota refusal", async () => {
    const limiter = (await load()).authRateLimit
    expect(await limiter.limit("fictional-recipient")).toMatchObject(allowed)
    sdk.check.mockResolvedValue({ ...allowed, success: false, remaining: 0, reason: "cacheBlock" })
    expect(await limiter.limit("fictional-recipient")).toMatchObject({ success: false, remaining: 0 })
  })

  it("does not turn a provider exception into an allowance", async () => {
    const error = new Error("Fictional provider failure")
    sdk.check.mockRejectedValue(error)
    await expect((await load()).authRateLimit.limit("fictional-recipient")).rejects.toBe(error)
  })

  it.each([
    [undefined, undefined],
    ["https://your-url.upstash.io", "fictional-token"],
    ["https://redis.example.test", "your-token"],
    [" ", " "],
    ["http://redis.example.test", "fictional-token"],
    ["not-a-url", "fictional-token"],
    ["https://user:synthetic@redis.example.test", "fictional-token"],
    ["https://redis.example.test/#fragment", "fictional-token"],
  ])("refuses production checks with unusable configuration (%s)", async (url, token) => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url)
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token)
    expect(await (await load()).authRateLimit.limit("fictional-recipient")).toMatchObject({ success: false, remaining: 0 })
    expect(sdk.check).not.toHaveBeenCalled()
  })

  it.each(["development", "test"])("keeps the bounded local limiter in %s", async mode => {
    vi.stubEnv("NODE_ENV", mode)
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined)
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined)
    const limiter = (await load()).authRateLimit
    for (let i = 0; i < 5; i++) expect((await limiter.limit("fictional-recipient")).success).toBe(true)
    expect((await limiter.limit("fictional-recipient")).success).toBe(false)
  })

  it("permits only the explicitly declared isolated CI recipe to use local counters in production builds", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined)
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined)
    vi.stubEnv("GITHUB_ACTIONS", "true")
    vi.stubEnv("RECIPE_ISOLATED", "true")
    vi.stubEnv("E2E_ENABLE_CREDENTIALS_AUTH", "true")
    const limiter = (await load()).authRateLimit
    for (let i = 0; i < 5; i++) expect((await limiter.limit("fictional-recipient")).success).toBe(true)
    expect((await limiter.limit("fictional-recipient")).success).toBe(false)
  })

  it.each(["GITHUB_ACTIONS", "RECIPE_ISOLATED", "E2E_ENABLE_CREDENTIALS_AUTH"])("requires %s before enabling local counters in a production recipe", async flag => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined)
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined)
    vi.stubEnv("GITHUB_ACTIONS", "true")
    vi.stubEnv("RECIPE_ISOLATED", "true")
    vi.stubEnv("E2E_ENABLE_CREDENTIALS_AUTH", "true")
    vi.stubEnv(flag, "")
    expect((await (await load()).authRateLimit.limit("fictional-recipient")).success).toBe(false)
  })
})

it("reproduces the installed Upstash SDK timeout allowance without network access", async () => {
  vi.useFakeTimers()
  const { Ratelimit } = await vi.importActual<typeof import("@upstash/ratelimit")>("@upstash/ratelimit")
  const never = new Promise<never>(() => {})
  const redis = { evalsha: vi.fn(() => never), eval: vi.fn(() => never) } as unknown as Redis
  const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m"), analytics: false, ephemeralCache: false })
  const result = limiter.limit("fictional-sdk-timeout")
  await vi.advanceTimersByTimeAsync(5_000)
  expect(await result).toMatchObject({ success: true, reason: "timeout" })
})
