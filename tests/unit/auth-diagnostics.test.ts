import type { NextAuthConfig } from "next-auth"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  configure: vi.fn(), warn: vi.fn(), findUnique: vi.fn(),
  limit: vi.fn(),
}))
vi.mock("next-auth", () => ({ default: (config: NextAuthConfig) => { mocks.configure(config); return { handlers: {} } } }))
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }))
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }))
vi.mock("@/auth.config", () => ({ authConfig: { providers: [] } }))
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.findUnique } } }))
vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn } }))
vi.mock("@/lib/rate-limit", () => ({ authRateLimit: { limit: mocks.limit } }))
vi.mock("@/lib/demo-mode", () => ({ DEMO_ACCOUNT_EMAIL: "demo@example.test", isDemoMode: false }))
vi.mock("@/lib/demo-policy", () => ({ isPublicReadOnlyDemo: () => false }))
vi.mock("@/lib/auth/password", () => ({ verifyPassword: vi.fn() }))
vi.mock("@/lib/auth/mfa", () => ({ verifyAndConsumeSecondFactor: vi.fn() }))

await import("@/auth")
const config = mocks.configure.mock.calls[0][0] as NextAuthConfig
const provider = config.providers[0]
if (typeof provider === "function" || !("authorize" in provider)) throw new Error("Credentials provider missing from authentication configuration")

beforeEach(() => {
  mocks.warn.mockClear()
  mocks.findUnique.mockReset()
  mocks.limit.mockResolvedValue({ success: true })
})

it.each([
  { error: Object.assign(new Error("postgresql://demo:fictional-password@db.example.test/crm email=private@example.test token=synthetic-bearer"), { name: "PrismaClientInitializationError", code: "P1001" }), name: "PrismaClientInitializationError", code: "P1001" },
  { error: Object.assign(new Error("provider diagnostic includes synthetic-bearer"), { name: "synthetic-bearer", code: "fictional-password" }), name: "unclassified", code: "unclassified" },
  { error: "private@example.test synthetic-bearer", name: "unclassified", code: "unclassified" },
])("refuses authentication while logging only classified diagnostics: $name / $code", async ({ error, name, code }) => {
  mocks.findUnique.mockRejectedValueOnce(error)
  await expect(provider.authorize({ email: "private@example.test", password: "fictional-password" }, new Request("https://example.test/auth", { headers: { "x-forwarded-for": "192.0.2.1" } }))).resolves.toBeNull()
  expect(mocks.warn).toHaveBeenCalledOnce()
  expect(mocks.warn.mock.calls[0][0]).toEqual({ event: "credentials_authorization_failed", errorName: name, errorCode: code })
  const diagnostic = JSON.stringify(mocks.warn.mock.calls)
  for (const secret of ["fictional-password", "private@example.test", "synthetic-bearer", "postgresql://"]) expect(diagnostic).not.toContain(secret)
})
