import { afterAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
const actor = vi.hoisted(() => ({ companyId: "", membershipId: "", userId: "", role: "OWNER" as const, agencyIds: null }))
vi.mock("@/lib/auth-wrapper", async () => {
  const { requestContext } = await import("@/lib/context")
  return { withAuth: (task: (context: typeof actor) => Promise<unknown>) => requestContext.run({ ...actor, actionPermission: "members.manage" }, () => task(actor)) }
})
import prisma from "@/lib/prisma"
import { deactivateTeamMember } from "@/actions/team"

describe.sequential("member departure and mailbox credentials on SQL", () => {
  const companies: string[] = [], users: string[] = []
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companies } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictitious departure" } }); companies.push(company.id)
    const owner = await prisma.user.create({ data: { name: "Fixture owner" } })
    const colleague = await prisma.user.create({ data: { name: "Fixture colleague" } }); users.push(owner.id, colleague.id)
    const ownerMembership = await prisma.membership.create({ data: { companyId: company.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: colleague.id, role: "SALES", status: "ACTIVE" } })
    Object.assign(actor, { companyId: company.id, membershipId: ownerMembership.id, userId: owner.id })
    return { company, owner, colleague, ownerMembership, member }
  }

  it("atomically disconnects owned private/shared mailboxes and cancels OAuth while preserving history and other tenants", async () => {
    const { company, owner, colleague, member } = await fixture()
    const foreign = await prisma.company.create({ data: { name: "Fictitious other workspace" } }); companies.push(foreign.id)
    const owned: string[] = []
    for (const visibility of ["PRIVATE", "SHARED"]) {
      const box = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: colleague.id, provider: "GOOGLE", visibility, emailAddress: `${visibility.toLowerCase()}@example.test`, status: "ACTIVE", credentialsEncrypted: "fictitious-token-only", oauthNonceHash: "fictitious-nonce", oauthAttemptId: "fictitious-attempt", oauthExpiresAt: new Date(Date.now() + 60_000), oauthStartedByUserId: colleague.id, config: { mode: "OAUTH" } } })
      owned.push(box.id)
      await prisma.emailThread.create({ data: { companyId: company.id, channelId: box.id, subject: "Preserved fictional history" } })
    }
    const foreignBox = await prisma.communicationChannel.create({ data: { companyId: foreign.id, ownerUserId: colleague.id, provider: "GOOGLE", emailAddress: "foreign@example.test", status: "ACTIVE", credentialsEncrypted: "foreign-fictitious-token" } })
    const ownerBox = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: owner.id, provider: "GOOGLE", emailAddress: "owner@example.test", status: "ACTIVE", credentialsEncrypted: "owner-fictitious-token" } })
    expect(await deactivateTeamMember(member.id)).toEqual({ success: true })
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("INACTIVE")
    const disconnected = await prisma.communicationChannel.findMany({ where: { id: { in: owned } } })
    for (const box of disconnected) {
      expect(box.status).toBe("PENDING")
      expect(box.credentialsEncrypted).toBeNull()
      expect(box.oauthNonceHash).toBeNull()
      expect(box.oauthAttemptId).toBeNull()
      expect(box.oauthStartedByUserId).toBeNull()
      expect(box.oauthExpiresAt).toBeNull()
      expect(box.config).toEqual({ mode: "DISCONNECTED" })
      expect(box.ownerUserId).toBe(colleague.id)
    }
    expect(await prisma.emailThread.count({ where: { companyId: company.id } })).toBe(2)
    for (const id of [foreignBox.id, ownerBox.id]) expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE")
  })

  it("keeps the last owner active when the actor's membership changed after authorization", async () => {
    const { ownerMembership, member } = await fixture()
    await prisma.membership.update({ where: { id: ownerMembership.id }, data: { status: "INACTIVE" } })
    await prisma.membership.update({ where: { id: member.id }, data: { role: "OWNER" } })
    expect(await deactivateTeamMember(member.id)).toMatchObject({ success: false, error: "Le dernier propriétaire ne peut pas être désactivé." })
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("ACTIVE")
  })

  it("rejects self-deactivation and foreign member IDs before touching mailboxes", async () => {
    const { ownerMembership, member } = await fixture()
    const foreign = await prisma.company.create({ data: { name: "Fictitious foreign member" } }); companies.push(foreign.id)
    const user = await prisma.user.create({ data: { name: "Fictitious foreign user" } }); users.push(user.id)
    const foreignMember = await prisma.membership.create({ data: { companyId: foreign.id, userId: user.id, role: "SALES", status: "ACTIVE" } })
    expect(await deactivateTeamMember(ownerMembership.id)).toMatchObject({ success: false })
    expect(await deactivateTeamMember(foreignMember.id)).toMatchObject({ success: false, error: "Membre introuvable." })
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("ACTIVE")
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: foreignMember.id } })).status).toBe("ACTIVE")
  })
})
