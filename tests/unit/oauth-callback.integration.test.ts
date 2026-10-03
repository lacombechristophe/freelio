import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
vi.mock("server-only", () => ({}))
const auth = vi.hoisted(() => ({ companyId: "", userId: "", denied: false }))
vi.mock("@/lib/route-auth", () => ({ withRouteAuth: (_permission: string, handler: (context: typeof auth) => Promise<Response>) => auth.denied ? Response.json({ error: "Denied" }, { status: 403 }) : handler(auth) }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/integrations/email-oauth", async (original) => {
  const actual = await original<typeof import("@/lib/integrations/email-oauth")>()
  return { ...actual, exchangeEmailAuthorizationCode: vi.fn(async () => ({ access_token: "fictional-access-token", refresh_token: "fictional-refresh-token", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.modify" })), fetchEmailOAuthIdentity: vi.fn(async () => ({ addresses: ["oauth@example.test"], displayName: "Fixture" })) }
})
import prisma from "@/lib/prisma"
import { createEmailOAuthNonce, createEmailOAuthState, emailOAuthNonceHash, exchangeEmailAuthorizationCode } from "@/lib/integrations/email-oauth"
import { GET } from "@/app/api/integrations/email/oauth/callback/route"

describe.sequential("OAuth callback consumption and cleanup", () => {
  const companies: string[] = [], users: string[] = []
  beforeEach(() => { vi.clearAllMocks(); auth.denied = false })
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictitious OAuth" } }); companies.push(company.id); auth.companyId = company.id
    const user = await prisma.user.create({ data: { name: "Fictitious OAuth owner" } }); users.push(user.id); auth.userId = user.id
    const nonce = createEmailOAuthNonce()
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, provider: "GOOGLE", emailAddress: "oauth@example.test", oauthNonceHash: emailOAuthNonceHash(nonce), oauthAttemptId: emailOAuthNonceHash(nonce), oauthExpiresAt: new Date(Date.now() + 60_000), oauthStartedByUserId: user.id } })
    const state = createEmailOAuthState({ provider: "GOOGLE", companyId: company.id, userId: user.id, channelId: channel.id, nonce })
    const request = (query = `code=fictional-code&state=${encodeURIComponent(state)}`) => new NextRequest(`http://127.0.0.1/api/integrations/email/oauth/callback?${query}`, { headers: { cookie: `crm_email_oauth_google=${nonce}.${createEmailOAuthNonce()}` } })
    return { channel, request, state }
  }
  function expectCleaned(response: Response) {
    const cookies = response.headers.get("set-cookie") || ""
    expect(cookies).toContain("crm_email_oauth_google=")
    expect(cookies).toContain("crm_email_oauth_microsoft=")
    expect(cookies).toContain("Path=/api/integrations/email/oauth/callback")
    expect(cookies).toContain("Max-Age=0")
  }
  it("consumes the nonce before remote exchange and rejects replay", async () => {
    const { channel, request } = await fixture()
    expectCleaned(await GET(request()))
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("ACTIVE")
    const replay = await GET(request())
    expect(replay.headers.get("location")).toContain("state_mismatch")
    expect(exchangeEmailAuthorizationCode).toHaveBeenCalledTimes(1)
    expectCleaned(replay)
  })
  it("cleans cookies on missing data, consent denial and authorization denial", async () => {
    const { request, state, channel } = await fixture()
    expectCleaned(await GET(request("")))
    expectCleaned(await GET(request(`error=access_denied&state=${encodeURIComponent(state)}`)))
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).oauthNonceHash).toBeNull()
    expect(exchangeEmailAuthorizationCode).not.toHaveBeenCalled()
    auth.denied = true
    const denied = await GET(request()); expect(denied.status).toBe(403); expectCleaned(denied)
  })
  it("does not overwrite a newer authorization started during the remote call", async () => {
    const { request, channel } = await fixture()
    vi.mocked(exchangeEmailAuthorizationCode).mockImplementationOnce(async () => {
      await prisma.communicationChannel.update({ where: { id: channel.id }, data: { oauthAttemptId: "new-attempt", oauthNonceHash: "new-nonce" } })
      return { access_token: "fictional-access-token", refresh_token: "fictional-refresh-token", expires_in: 3600 }
    })
    const result = await GET(request())
    expect(result.headers.get("location")).toContain("oauth_failed")
    const current = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    expect(current.credentialsEncrypted).toBeNull(); expect(current.oauthNonceHash).toBe("new-nonce")
  })
})
