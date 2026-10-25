import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(), discardIssuedInvoice: vi.fn() }))
import prisma from "@/lib/prisma"
import { getClientChoices } from "@/actions/clients/choices"
import { createQuote, updateQuote } from "@/actions/devis"
import { createInvoice, updateInvoice } from "@/actions/factures"
import { createContract, updateContract } from "@/actions/contrats"
import { createOpportunity, updateOpportunity } from "@/actions/pipeline"

describe.sequential("Document and opportunity client choices cover the company without changing write permissions", () => {
  let foreignCompanyId: string, foreignClientId: string, lastClientId: string, membershipId: string, pipelineId: string
  const line = { label: "Fictional choice service", quantity: 1, unitPriceCents: 12345, tvaRate: 20 }
  const quoteInput = (clientId: string) => ({ clientId, object: "Fictional choice quote", lines: [line] })
  const invoiceInput = (clientId: string) => ({ clientId, object: "Fictional choice invoice", dueDate: "2030-01-01", lines: [line] })
  const contractInput = (clientId: string) => ({ clientId, title: "Fictional choice contract", content: "<p>Fictional contractual content.</p>" })
  const opportunityInput = (clientId: string) => ({ pipelineId, clientId, title: "Fictional choice opportunity", status: "PROSPECT", valueCents: 12345, probability: 30 })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional document choices" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign document choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `document-choices-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    await prisma.client.createMany({ data: Array.from({ length: 1000 }, (_, index) => ({ companyId: session.companyId, name: `Client ${String(index).padStart(4, "0")}`, totalRevenueCents: 987654321, relationScore: 99 })) })
    lastClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "ZZ DERNIER CLIENT" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN CLIENT" } })).id
    pipelineId = (await prisma.pipeline.create({ data: { companyId: session.companyId, name: "Fictional choices", stages: [{ id: "PROSPECT", title: "Prospect" }] } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.quote.deleteMany({ where: { companyId: session.companyId } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.contract.deleteMany({ where: { companyId: session.companyId } })
    await prisma.opportunity.deleteMany({ where: { pipelineId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.pipeline.delete({ where: { id: pipelineId } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reaches all 1001 choices once, with a stable order and only id/name", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 41; page++) {
      const data = await getClientChoices({ page })
      expect(data).toMatchObject({ total: 1001, page })
      expect(data.items).toHaveLength(page === 41 ? 1 : 25)
      for (const item of data.items) { expect(Object.keys(item).sort()).toEqual(["id", "name"]); ids.push(item.id) }
    }
    expect(new Set(ids).size).toBe(1001); expect(ids.at(-1)).toBe(lastClientId)
  })
  it("searches beyond the former ceiling and separately verifies a choice outside the query", async () => {
    expect(await getClientChoices({ search: "  dernier client  " })).toMatchObject({ total: 1, items: [{ id: lastClientId }] })
    expect(await getClientChoices({ selectedId: lastClientId, search: "no match", page: 99 })).toEqual({ total: 0, page: 1, items: [], selected: { id: lastClientId, name: "ZZ DERNIER CLIENT" } })
  })
  it("clamps pages and orders equal names by id without duplicates", async () => {
    expect(await getClientChoices({ page: 99 })).toMatchObject({ page: 41, items: [{ id: lastClientId }] })
    const name = "Fictional tied choice"
    await prisma.client.createMany({ data: Array.from({ length: 26 }, () => ({ companyId: session.companyId, name })) })
    try {
      const first = await getClientChoices({ search: name }), second = await getClientChoices({ search: name, page: 2 })
      const ids = [...first.items, ...second.items].map(item => item.id)
      expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(1)
      expect(new Set(ids).size).toBe(26); expect(ids).toEqual([...ids].sort())
    } finally { await prisma.client.deleteMany({ where: { companyId: session.companyId, name } }) }
  })
  it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("keeps minimal company-shared choices for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const result = await getClientChoices({ selectedId: lastClientId })
    expect(result).toMatchObject({ total: 1001, selected: { id: lastClientId } })
    for (const item of [...result.items, result.selected!]) expect(Object.keys(item).sort()).toEqual(["id", "name"])
    expect(await getClientChoices({ search: "FOREIGN", selectedId: foreignClientId })).toEqual({ total: 0, page: 1, items: [], selected: null })
  })
  it("keeps replacement choices when the selected client was deleted", async () => {
    const removed = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional removed choice" } })
    await prisma.client.delete({ where: { id: removed.id } })
    expect(await getClientChoices({ selectedId: removed.id, search: "Client 0001" })).toMatchObject({ total: 1, selected: null, items: [{ name: "Client 0001" }] })
  })
  it("checks membership before reading the directory", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } })
    const count = vi.spyOn(prisma.client, "count")
    await expect(getClientChoices()).rejects.toThrow("plus accès")
    expect(count).not.toHaveBeenCalled()
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { selectedId: "" }, { companyId: "foreign" }])("rejects malformed input %j", async input => {
    await expect(getClientChoices(input)).rejects.toThrow()
  })
  it.each(["OWNER", "ADMIN"])("creates and edits all four resources using the last choice for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getClientChoices({ selectedId: lastClientId })).selected?.id).toBe(lastClientId)
    const quote = await createQuote(quoteInput(lastClientId)), invoice = await createInvoice(invoiceInput(lastClientId))
    const contract = await createContract(contractInput(lastClientId)), opportunity = await createOpportunity(opportunityInput(lastClientId))
    await updateQuote(quote.id, { ...quoteInput(lastClientId), object: "Edited fictional quote" })
    await updateInvoice(invoice.id, { ...invoiceInput(lastClientId), object: "Edited fictional invoice" })
    await updateContract(contract.id, { ...contractInput(lastClientId), title: "Edited fictional contract" })
    await updateOpportunity(opportunity.id, { ...opportunityInput(lastClientId), title: "Edited fictional opportunity" })
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ clientId: lastClientId, object: "Edited fictional quote" })
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ clientId: lastClientId, object: "Edited fictional invoice", totalHtCents: 12345 })
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ clientId: lastClientId, title: "Edited fictional contract" })
    expect(await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).toMatchObject({ clientId: lastClientId, title: "Edited fictional opportunity", valueCents: 12345 })
  })
  it("revalidates a foreign choice in all four create actions without audit", async () => {
    await expect(createQuote(quoteInput(foreignClientId))).rejects.toThrow(/Client.*introuvable/i)
    await expect(createInvoice(invoiceInput(foreignClientId))).rejects.toThrow(/Client.*introuvable/i)
    await expect(createContract(contractInput(foreignClientId))).rejects.toThrow(/Client.*introuvable/i)
    await expect(createOpportunity(opportunityInput(foreignClientId))).rejects.toThrow(/Client.*introuvable/i)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("does not turn shared choice access into Viewer write access", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    expect((await getClientChoices({ selectedId: lastClientId })).selected?.id).toBe(lastClientId)
    for (const action of [() => createQuote(quoteInput(lastClientId)), () => createInvoice(invoiceInput(lastClientId)), () => createContract(contractInput(lastClientId)), () => createOpportunity(opportunityInput(lastClientId))]) {
      await expect(action()).rejects.toThrow(/droits nécessaires|FORBIDDEN:(sales|finance)\.write/)
    }
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("keeps all choices readable but all four writes forbidden in public demo mode", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getClientChoices({ selectedId: lastClientId })).selected?.id).toBe(lastClientId)
    for (const action of [() => createQuote(quoteInput(lastClientId)), () => createInvoice(invoiceInput(lastClientId)), () => createContract(contractInput(lastClientId)), () => createOpportunity(opportunityInput(lastClientId))]) {
      await expect(action()).rejects.toThrow(/démonstration/i)
    }
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
