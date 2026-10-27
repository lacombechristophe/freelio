import type { NextAuthConfig } from "next-auth"
import type { CredentialsConfig } from "next-auth/providers/credentials"
import type { JWT } from "next-auth/jwt"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ configure: vi.fn(), findUnique: vi.fn(), limit: vi.fn(), warn: vi.fn() }))
vi.mock("next-auth", () => ({ default: (config: NextAuthConfig) => { mocks.configure(config); return { handlers: {} } } }))
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }))
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }))
vi.mock("@/auth.config", () => ({ authConfig: { providers: [] } }))
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.findUnique } } }))
vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn } }))
vi.mock("@/lib/rate-limit", () => ({ authRateLimit: { limit: vi.fn() }, demoAccessRateLimit: { limit: mocks.limit } }))
vi.mock("@/lib/auth/password", () => ({ verifyPassword: vi.fn() }))
vi.mock("@/lib/auth/mfa", () => ({ verifyAndConsumeSecondFactor: vi.fn() }))

const fictional = { id: "visitor-user", email: "direction@atelier-des-bassins.example.test", name: "Fictional visitor", image: null, companyId: "visitor-company", sessionVersion: 3, mfaEnabledAt: null, memberships: [{ companyId: "visitor-company" }] }
async function configuration() {
  await import("@/auth")
  return mocks.configure.mock.calls.at(-1)![0] as NextAuthConfig
}
function provider(config: NextAuthConfig) {
  return config.providers.find(candidate => typeof candidate !== "function" && candidate.id === "demo") as CredentialsConfig | undefined
}
async function jwt(config: NextAuthConfig, token: JWT, initial = false) {
  const callback = config.callbacks!.jwt!
  return callback({ token, user: { id: fictional.id }, account: initial ? { provider: "demo", providerAccountId: fictional.id, type: "credentials" } : null } as Parameters<typeof callback>[0]) as Promise<JWT>
}
beforeEach(() => {
  vi.resetModules()
  mocks.configure.mockClear()
  mocks.findUnique.mockReset().mockResolvedValue(fictional)
  mocks.limit.mockReset().mockResolvedValue({ success: true })
  mocks.warn.mockClear()
  vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
  vi.stubEnv("NEXT_PUBLIC_DEMO_READ_ONLY", "true")
  vi.stubEnv("RESEND_API_KEY", "")
})
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it.each(["DEMO_ACCESS_MODE", "NEXT_PUBLIC_DEMO_MODE", "NEXT_PUBLIC_DEMO_READ_ONLY"])("does not register visitor access with an inconsistent %s", async flag => {
  vi.stubEnv(flag, "")
  expect(provider(await configuration())).toBeUndefined()
  expect(mocks.findUnique).not.toHaveBeenCalled()
})
it("ignores caller-selected identity and only reads the existing fictional member, without a password or SQL session write", async () => {
  const config = await configuration()
  const demo = provider(config)!
  expect(demo.credentials).toEqual({})
  const user = await demo.authorize({ email: "other@example.test", companyId: "foreign-company", password: "ignored" }, new Request("https://example.test/api/auth/callback/demo", { method: "POST", headers: { "x-forwarded-for": "192.0.2.5" } }))
  expect(user).toEqual({ id: fictional.id, email: fictional.email, name: fictional.name, image: null })
  expect(mocks.findUnique.mock.calls[0][0].where).toEqual({ email: fictional.email })
  expect(JSON.stringify(mocks.findUnique.mock.calls)).not.toContain("passwordHash")
  expect(mocks.limit).toHaveBeenCalledWith("visitor:192.0.2.5")
  const token = await jwt(config, {}, true)
  expect(token).toMatchObject({ sub: fictional.id, companyId: fictional.companyId, demoCompanyId: fictional.companyId, publicDemoVisitor: true, sessionVersion: 3 })
})
it.each([null, { ...fictional, companyId: null }, { ...fictional, memberships: [] }, { ...fictional, memberships: [{ companyId: "other" }] }, { ...fictional, mfaEnabledAt: new Date() }])("refuses a missing, unassigned, revoked or MFA-protected fictional identity", async user => {
  mocks.findUnique.mockResolvedValue(user)
  expect(await provider(await configuration())!.authorize({}, new Request("https://example.test"))).toBeNull()
})
it.each(["quota", "unavailable"])("refuses access before a user read when the limiter reports %s", async failure => {
  if (failure === "quota") mocks.limit.mockResolvedValue({ success: false })
  else mocks.limit.mockRejectedValue(new Error("synthetic-secret"))
  expect(await provider(await configuration())!.authorize({}, new Request("https://example.test"))).toBeNull()
  expect(mocks.findUnique).not.toHaveBeenCalled()
  expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("synthetic-secret")
})
it("refuses a callback retained after the public mode is disabled", async () => {
  const demo = provider(await configuration())!
  vi.stubEnv("DEMO_ACCESS_MODE", "")
  expect(await demo.authorize({}, new Request("https://example.test"))).toBeNull()
  expect(mocks.limit).not.toHaveBeenCalled()
})
it.each(["mode", "build", "removed", "identity", "company", "version", "membership", "mfa"])("invalidates a visitor JWT after %s changes", async change => {
  const config = await configuration()
  const token = await jwt(config, {}, true)
  if (change === "mode") vi.stubEnv("DEMO_ACCESS_MODE", "")
  if (change === "build") vi.stubEnv("NEXT_PUBLIC_DEMO_READ_ONLY", "false")
  if (change === "removed") mocks.findUnique.mockResolvedValue(null)
  if (change === "identity") mocks.findUnique.mockResolvedValue({ ...fictional, id: "replacement" })
  if (change === "company") mocks.findUnique.mockResolvedValue({ ...fictional, companyId: "new-company", memberships: [{ companyId: "new-company" }] })
  if (change === "version") mocks.findUnique.mockResolvedValue({ ...fictional, sessionVersion: 4 })
  if (change === "membership") mocks.findUnique.mockResolvedValue({ ...fictional, memberships: [] })
  if (change === "mfa") mocks.findUnique.mockResolvedValue({ ...fictional, mfaEnabledAt: new Date() })
  const rejected = await jwt(config, token)
  expect(rejected).toMatchObject({ sessionInvalid: true, companyId: null, publicDemoVisitor: true })
  expect(rejected.sub).toBeUndefined()
  const callback = config.callbacks!.session!
  const session = await callback({ token: rejected, session: { user: { id: fictional.id }, expires: "" } } as Parameters<typeof callback>[0])
  expect(session.user).toBeUndefined()
})
it("keeps a visitor session valid on refresh while rechecking the identity and active membership", async () => {
  const config = await configuration()
  const token = await jwt(config, {}, true)
  expect(await jwt(config, token)).toMatchObject({ sub: fictional.id, companyId: fictional.companyId, publicDemoVisitor: true })
  expect(mocks.findUnique).toHaveBeenCalledTimes(2)
})
