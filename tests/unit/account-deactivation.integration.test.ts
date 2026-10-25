import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "", email: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId, email: session.email }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
import { anonymizeAccount } from "@/actions/compliance"
import { acceptTeamInvitation, updateTeamMemberRole } from "@/actions/team"
import { createInvitationToken, hashInvitationToken } from "@/lib/team-invitations"

const db = createDatabaseClient()
const sqlite = process.env.DATABASE_URL?.startsWith("file:")
describe.sequential("Account departure preserves shared business data", () => {
  let companyA: string, companyB: string, actorId: string, successorId: string, peerId: string, actorEmail: string
  const own = () => ({ userId: actorId })
  async function invitation(role: string) {
    const token = createInvitationToken()
    const row = await db.companyInvitation.create({ data: { companyId: companyA, email: actorEmail, role, tokenHash: hashInvitationToken(token), invitedById: successorId, expiresAt: new Date("2030-01-01") } })
    return { token, id: row.id }
  }
  async function dropAuditFault() {
    if (sqlite) await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_account_audit_fault"')
    else {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_account_audit_fault" ON "AuditLog"')
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_account_audit_fault()')
    }
  }
  async function snapshot() {
    return {
      user: await db.user.findUniqueOrThrow({ where: { id: actorId } }),
      companies: await db.company.findMany({ where: { id: { in: [companyA, companyB] } }, orderBy: { id: "asc" } }),
      contacts: await db.contact.findMany({ where: { client: { companyId: { in: [companyA, companyB] } } }, orderBy: { id: "asc" } }),
      memberships: await db.membership.findMany({ where: own(), orderBy: { id: "asc" } }),
      channels: await db.communicationChannel.findMany({ where: { companyId: { in: [companyA, companyB] } }, orderBy: { id: "asc" } }),
      accounts: await db.account.findMany({ where: own() }), sessions: await db.session.findMany({ where: own() }),
      resets: await db.passwordResetToken.findMany({ where: own() }), recovery: await db.mfaRecoveryCode.findMany({ where: own() }),
      keys: await db.apiKey.findMany({ where: own() }), notifications: await db.notification.findMany({ where: own(), orderBy: { id: "asc" } }),
      signatures: await db.emailSignature.findMany({ where: { authorUserId: actorId }, orderBy: { id: "asc" } }),
      verification: await db.verificationToken.findMany({ where: { identifier: actorEmail } }),
    }
  }
  beforeEach(async () => {
    companyA = (await db.company.create({ data: { name: "Fictional shared A", fullName: "Protected company identity", phone: "fictional company phone" } })).id
    companyB = (await db.company.create({ data: { name: "Fictional shared B" } })).id
    actorEmail = `${randomUUID()}@example.test`
    actorId = (await db.user.create({ data: { companyId: companyA, name: "Fictional departing account", email: actorEmail, emailVerified: new Date(), passwordHash: "fictional-password-hash", mfaSecretEncrypted: "fictional-mfa-secret", mfaEnabledAt: new Date() } })).id
    successorId = (await db.user.create({ data: { companyId: companyA, name: "Fictional successor", email: `${randomUUID()}@example.test` } })).id
    peerId = (await db.user.create({ data: { companyId: companyA, name: "Fictional peer", email: `${randomUUID()}@example.test` } })).id
    session.userId = actorId; session.companyId = companyA; session.email = actorEmail
    await db.membership.createMany({ data: [
      { companyId: companyA, userId: actorId, role: "OWNER", status: "ACTIVE" }, { companyId: companyB, userId: actorId, role: "SALES", status: "ACTIVE" },
      { companyId: companyA, userId: successorId, role: "OWNER", status: "ACTIVE" }, { companyId: companyB, userId: successorId, role: "OWNER", status: "ACTIVE" },
      { companyId: companyA, userId: peerId, role: "VIEWER", status: "ACTIVE" },
    ] })
    for (const companyId of [companyA, companyB]) {
      const client = await db.client.create({ data: { companyId, name: "Protected shared client" } })
      await db.contact.create({ data: { clientId: client.id, firstName: "Protected", lastName: "Colleague contact", email: "fictional-contact@example.test" } })
      await db.communicationChannel.create({ data: { companyId, ownerUserId: actorId, provider: "GOOGLE_WORKSPACE", visibility: companyId === companyA ? "PRIVATE" : "SHARED", emailAddress: actorEmail, status: "ACTIVE", credentialsEncrypted: "fictional-opaque-mail-credentials", config: { mode: "OAUTH" }, oauthNonceHash: "fictional-pending-nonce", oauthAttemptId: "fictional-attempt", oauthStartedByUserId: actorId } })
      await db.notification.create({ data: { companyId, userId: actorId, type: "SYSTEM", title: "Fictional account notice", message: "Fictional notice" } })
      await db.emailSignature.create({ data: { companyId, authorUserId: actorId, text: "Fictional personal signature" } })
    }
    await db.communicationChannel.create({ data: { companyId: companyA, ownerUserId: peerId, provider: "GOOGLE_WORKSPACE", emailAddress: "fictional-peer@example.test", status: "ACTIVE", credentialsEncrypted: "protected-peer-credentials" } })
    await db.account.create({ data: { userId: actorId, type: "oauth", provider: "fictional", providerAccountId: randomUUID(), access_token: "fictional-auth-token" } })
    await db.session.create({ data: { userId: actorId, sessionToken: randomUUID(), expires: new Date("2030-01-01") } })
    await db.passwordResetToken.create({ data: { userId: actorId, tokenHash: randomUUID(), expiresAt: new Date("2030-01-01") } })
    await db.mfaRecoveryCode.create({ data: { userId: actorId, codeHash: randomUUID() } })
    await db.apiKey.create({ data: { userId: actorId, key: randomUUID(), name: "Fictional personal key" } })
    await db.verificationToken.create({ data: { identifier: actorEmail, token: randomUUID(), expires: new Date("2030-01-01") } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs(); await dropAuditFault()
    const users = [actorId, successorId, peerId]
    await db.auditLog.deleteMany({ where: { userId: { in: users } } })
    await db.notification.deleteMany({ where: { userId: { in: users } } })
    await db.apiKey.deleteMany({ where: { userId: { in: users } } })
    await db.verificationToken.deleteMany({ where: { identifier: actorEmail } })
    await db.communicationChannel.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await db.client.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await db.membership.deleteMany({ where: { userId: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } })
  })
  afterAll(async () => { await db.$disconnect() })

  it("preserves shared company data and another member's mailbox when an owner departs", async () => {
    const before = await snapshot(), peerBefore = await db.user.findUniqueOrThrow({ where: { id: peerId } })
    expect(await anonymizeAccount()).toEqual({ success: true })
    const after = await snapshot()
    expect(after.companies).toEqual(before.companies); expect(after.contacts).toEqual(before.contacts)
    expect(after.user).toMatchObject({ name: "[Supprimé]", companyId: null, passwordHash: null, mfaSecretEncrypted: null, mfaEnabledAt: null, emailVerified: null, sessionVersion: before.user.sessionVersion + 1 })
    expect(after.memberships.every(row => row.status === "INACTIVE")).toBe(true)
    for (const rows of [after.accounts, after.sessions, after.resets, after.recovery, after.keys, after.notifications, after.signatures, after.verification]) expect(rows).toEqual([])
    for (const row of after.channels.filter(row => row.ownerUserId === actorId)) expect(row).toMatchObject({ status: "PENDING", credentialsEncrypted: null, oauthNonceHash: null, oauthAttemptId: null, oauthStartedByUserId: null, config: { mode: "DISCONNECTED" } })
    expect(after.channels.find(row => row.ownerUserId === peerId)).toEqual(before.channels.find(row => row.ownerUserId === peerId))
    expect(await db.user.findUniqueOrThrow({ where: { id: peerId } })).toEqual(peerBefore)
    expect(await db.auditLog.count({ where: own() })).toBe(1)
  })
  it.each(["VIEWER", "TECHNICIAN", "ACCOUNTING"])("allows %s to leave without company or member administration", async role => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: actorId }, data: { role } })
    const before = await snapshot()
    expect(await anonymizeAccount()).toEqual({ success: true })
    const after = await snapshot()
    expect(after.companies).toEqual(before.companies); expect(after.contacts).toEqual(before.contacts)
    expect(after.memberships.every(row => row.status === "INACTIVE")).toBe(true)
  })
  it.each(["primary", "secondary"])("refuses when the account is the last owner of its %s workspace", async kind => {
    const companyId = kind === "primary" ? companyA : companyB
    await db.membership.updateMany({ where: { companyId, userId: actorId }, data: { role: "OWNER" } })
    await db.membership.updateMany({ where: { companyId, userId: successorId }, data: { role: "ADMIN" } })
    const before = await snapshot()
    expect(await anonymizeAccount()).toMatchObject({ success: false, error: expect.stringContaining("propriétaire") })
    expect(await snapshot()).toEqual(before); expect(await db.auditLog.count({ where: own() })).toBe(0)
  })
  it("rolls back profile, credentials and membership changes if the mandatory audit fails", async () => {
    const before = await snapshot(); expect(actorId).toMatch(/^[a-z0-9]+$/)
    if (sqlite) await db.$executeRawUnsafe(`CREATE TRIGGER "fictional_account_audit_fault" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${actorId}' BEGIN SELECT RAISE(ABORT, 'Fictional account audit failure'); END`)
    else {
      await db.$executeRawUnsafe(`CREATE FUNCTION fictional_account_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${actorId}' THEN RAISE EXCEPTION 'Fictional account audit failure'; END IF; RETURN NEW; END; $$`)
      await db.$executeRawUnsafe('CREATE TRIGGER "fictional_account_audit_fault" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_account_audit_fault()')
    }
    await expect(anonymizeAccount()).rejects.toThrow()
    expect(await snapshot()).toEqual(before); expect(await db.auditLog.count({ where: own() })).toBe(0)
  })
  it("keeps an owner when two accounts try to depart concurrently", async () => {
    await db.membership.updateMany({ where: { companyId: companyB, userId: actorId }, data: { role: "OWNER" } })
    const first = anonymizeAccount(); session.userId = successorId
    const results = await Promise.allSettled([first, anonymizeAccount()])
    expect(results.filter(row => row.status === "fulfilled" && row.value.success)).toHaveLength(1)
    expect(await db.membership.count({ where: { companyId: companyA, role: "OWNER", status: "ACTIVE" } })).toBe(1)
    expect(await db.membership.count({ where: { companyId: companyB, role: "OWNER", status: "ACTIVE" } })).toBe(1)
  })
  it("keeps an owner when departure races the other owner's demotion", async () => {
    const successor = await db.membership.findUniqueOrThrow({ where: { companyId_userId: { companyId: companyA, userId: successorId } } })
    const first = anonymizeAccount(); session.userId = successorId
    const results = await Promise.allSettled([first, updateTeamMemberRole(successor.id, "SALES")])
    expect(results.filter(row => row.status === "fulfilled" && row.value.success)).toHaveLength(1)
    expect(await db.membership.count({ where: { companyId: companyA, role: "OWNER", status: "ACTIVE" } })).toBe(1)
  })
  it("rejects public-demo writes before changing account data", async () => {
    const before = await snapshot(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(anonymizeAccount()).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("keeps the last owner's role when an older invitation is accepted", async () => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: successorId }, data: { role: "ADMIN" } })
    const invite = await invitation("VIEWER")
    await acceptTeamInvitation(invite.token)
    expect(await db.membership.count({ where: { companyId: companyA, role: "OWNER", status: "ACTIVE" } })).toBe(1)
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).not.toBeNull()
  })
  it("does not elevate an active member through an old invitation", async () => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: actorId }, data: { role: "VIEWER" } })
    const invite = await invitation("OWNER")
    await acceptTeamInvitation(invite.token)
    expect((await db.membership.findUniqueOrThrow({ where: { companyId_userId: { companyId: companyA, userId: actorId } } })).role).toBe("VIEWER")
  })
  it("allows a valid invitation to restore an inactive member with the invited role", async () => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: actorId }, data: { role: "VIEWER", status: "INACTIVE" } })
    const invite = await invitation("SALES")
    await acceptTeamInvitation(invite.token)
    expect(await db.membership.findUniqueOrThrow({ where: { companyId_userId: { companyId: companyA, userId: actorId } } })).toMatchObject({ role: "SALES", status: "ACTIVE" })
  })
  it("does not reactivate a departed account through a stale session's email", async () => {
    const invite = await invitation("SALES")
    expect(await anonymizeAccount()).toEqual({ success: true })
    const before = await snapshot()
    expect(await acceptTeamInvitation(invite.token)).toMatchObject({ success: false, error: expect.stringContaining("compte a changé") })
    expect(await snapshot()).toEqual(before)
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull()
  })
})
