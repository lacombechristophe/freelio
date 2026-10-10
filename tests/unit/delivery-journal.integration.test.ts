import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getAutomationDeliveryJournal, getAutomationDeliveryDetails, getAutomationJournalSequences } from "@/actions/automations"

describe.sequential("complete delivery journal with mailbox ACL and safe projection", () => {
  let companyId: string, foreignCompanyId: string, memberId: string, colleagueId: string, sharedId: string, privateId: string, privateDeliveryId: string, foreignDeliveryId: string
  let sequences: { id: string; name: string }[]
  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: "Fictional complete journal" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign journal" } })).id
    session.companyId = companyId
    session.userId = (await prisma.user.create({ data: { email: `journal-${randomUUID()}@example.test` } })).id
    colleagueId = (await prisma.user.create({ data: { email: `journal-other-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    sharedId = (await prisma.communicationChannel.create({ data: { companyId, provider: "RESEND", emailAddress: "shared@example.test", visibility: "SHARED" } })).id
    privateId = (await prisma.communicationChannel.create({ data: { companyId, ownerUserId: colleagueId, provider: "GOOGLE", emailAddress: "private@example.test", visibility: "PRIVATE" } })).id
    sequences = []
    for (let index = 0; index < 51; index++) sequences.push(await prisma.emailSequence.create({ data: { companyId, senderChannelId: sharedId, name: `Fictional sequence ${String(index).padStart(3, "0")}`, status: index === 50 ? "ARCHIVED" : "DRAFT" }, select: { id: true, name: true } }))
    await prisma.emailSequence.create({ data: { companyId, senderChannelId: privateId, name: "Private sequence" } })
    await prisma.emailDelivery.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, channelId: sharedId, sequenceId: sequences[index % 51].id, recipientEmail: `recipient${index}@example.test`, subject: `Fictional mail ${String(index).padStart(3, "0")}`, status: index % 2 ? "SENT" : "FAILED", scheduledAt: new Date("2000-01-01"), createdAt: new Date(Date.UTC(2000, 0, 1, 0, index)), payload: { secret: "FICTIONAL_SECRET_HIDDEN", bcc: ["hidden@example.test"] }, recoveryProof: { token: "FICTIONAL_PROOF_HIDDEN" } })) })
    privateDeliveryId = (await prisma.emailDelivery.create({ data: { companyId, channelId: privateId, subject: "Private delivery", recipientEmail: "private-recipient@example.test", scheduledAt: new Date() } })).id
    foreignDeliveryId = (await prisma.emailDelivery.create({ data: { companyId: foreignCompanyId, subject: "Foreign delivery", recipientEmail: "foreign@example.test", scheduledAt: new Date() } })).id
  })
  afterEach(async () => { vi.unstubAllEnvs(); await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "ACTIVE" } }); await prisma.communicationChannel.update({ where: { id: sharedId }, data: { visibility: "SHARED", ownerUserId: null } }) })
  afterAll(async () => { await prisma.company.delete({ where: { id: companyId } }); await prisma.company.delete({ where: { id: foreignCompanyId } }); await prisma.user.deleteMany({ where: { id: { in: [session.userId, colleagueId] } } }) })
  it("counts every accessible row and exposes the oldest delivery on the last page", async () => {
    const first = await getAutomationDeliveryJournal(), last = await getAutomationDeliveryJournal({ page: 999 })
    expect(first).toMatchObject({ total: 102, page: 1, pageCount: 5 }); expect(first.rows).toHaveLength(25)
    expect(last).toMatchObject({ total: 102, page: 5, pageCount: 5 }); expect(last.rows.at(-1)?.subject).toBe("Fictional mail 000")
  })
  it("combines case-insensitive search, state and sequence before count and pagination", async () => {
    const found = await getAutomationDeliveryJournal({ search: "FICTIONAL MAIL 000", status: "FAILED", sequenceId: sequences[0].id, page: 5 })
    expect(found).toMatchObject({ total: 1, page: 1, pageCount: 1 }); expect(found.rows[0].subject).toBe("Fictional mail 000")
    expect((await getAutomationDeliveryJournal({ search: "recipient100@" })).total).toBe(1)
    expect((await getAutomationDeliveryJournal({ search: "sequence 050" })).rows[0].sequence?.id).toBe(sequences[50].id)
    expect(await getAutomationDeliveryJournal({ status: "FAILED", search: "Fictional mail 001", page: 5 })).toMatchObject({ total: 0, rows: [], page: 1 })
  })
  it("does not return frozen content, hidden recipients, provider proof or raw identifiers", async () => {
    const page = await getAutomationDeliveryJournal({ search: "Fictional mail 000" }), detail = await getAutomationDeliveryDetails(page.rows[0].id)
    for (const value of [page, detail]) {
      expect(JSON.stringify(value)).not.toMatch(/FICTIONAL_SECRET|FICTIONAL_PROOF|hidden@example/)
      expect(value && "payload" in value).toBe(false)
    }
    expect(detail).toEqual({ ...page.rows[0], recovery: null })
  })
  it("paginates sequence choices including archived history and retains a selection outside the query", async () => {
    expect(await getAutomationJournalSequences({ page: 3 })).toMatchObject({ total: 52, page: 3, pageCount: 3 })
    const choices = await getAutomationJournalSequences({ search: "sequence 000", selectedId: sequences[50].id })
    expect(choices.rows).toEqual([sequences[0]]); expect(choices.selected).toEqual(sequences[50])
    expect((await getAutomationJournalSequences({ selectedId: sequences[50].id })).selected?.id).toBe(sequences[50].id)
  })
  it("keeps private rows out of both counts and detail for another ordinary member", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    expect((await getAutomationDeliveryJournal()).total).toBe(101)
    expect(await getAutomationDeliveryDetails(privateDeliveryId)).toBeNull()
    expect((await getAutomationJournalSequences()).total).toBe(51)
  })
  it("rereads revoked mailbox visibility when an old card or selected sequence is opened", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    const page = await getAutomationDeliveryJournal()
    await prisma.communicationChannel.update({ where: { id: sharedId }, data: { visibility: "PRIVATE", ownerUserId: colleagueId } })
    expect(await getAutomationDeliveryDetails(page.rows[0].id)).toBeNull()
    expect((await getAutomationDeliveryJournal()).total).toBe(0)
    expect((await getAutomationJournalSequences({ selectedId: sequences[0].id })).selected).toBeNull()
  })
  it("refuses foreign detail and selection under the authenticated company", async () => {
    expect(await getAutomationDeliveryDetails(foreignDeliveryId)).toBeNull()
    expect((await getAutomationDeliveryJournal({ search: "Foreign delivery" })).total).toBe(0)
    const foreign = await prisma.emailSequence.create({ data: { companyId: foreignCompanyId, name: "Foreign sequence" } })
    expect((await getAutomationJournalSequences({ selectedId: foreign.id })).selected).toBeNull()
  })
  it("checks current membership permission before any journal read", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "VIEWER" } })
    for (const action of [getAutomationDeliveryJournal, () => getAutomationDeliveryDetails(privateDeliveryId), getAutomationJournalSequences]) await expect(action()).rejects.toThrow("droits nécessaires")
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "SUSPENDED" } })
    await expect(getAutomationDeliveryJournal()).rejects.toThrow("plus accès")
  })
  it("allows fictional public-demo reads without writing", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getAutomationDeliveryJournal()).total).toBe(102)
    expect(await getAutomationDeliveryDetails(privateDeliveryId)).not.toBeNull()
    expect((await getAutomationJournalSequences()).total).toBe(52)
  })
  it("validates page, status and IDs without silently falling back to broad access", async () => {
    await expect(getAutomationDeliveryJournal({ page: 0 })).rejects.toThrow()
    await expect(getAutomationDeliveryJournal({ status: "INVALID" })).rejects.toThrow()
    await expect(getAutomationDeliveryDetails("invalid")).rejects.toThrow()
  })
})
