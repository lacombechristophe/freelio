import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getProjects, getProjectById } from "@/actions/projets"
import { getTimeEntries } from "@/actions/temps"
import { getQuoteById } from "@/actions/devis"
import { getInvoiceById } from "@/actions/factures"
import { getContractById } from "@/actions/contrats"

describe.sequential("shared client reader permissions on real SQL", () => {
  let membershipId: string, agencyId: string, foreignCompanyId: string, clientId: string, projectId: string, foreignProjectId: string, quoteId: string, invoiceId: string, contractId: string
  let inconsistentProjectId: string, inconsistentQuoteId: string, inconsistentInvoiceId: string, inconsistentContractId: string
  const values = { totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345, relationScore: 37 }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional shared client readers" } })).id
    session.userId = (await prisma.user.create({ data: { email: `client-readers-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional readers agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional reader client", ...values } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional reader project", budgetCents: 50000, consumedCents: 5000 } })).id
    quoteId = (await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId, number: "LOCAL", object: "Fictional reader quote" } })).id
    invoiceId = (await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId, number: "LOCAL", object: "Fictional reader invoice", dueDate: new Date("2030-01-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 } })).id
    contractId = (await prisma.contract.create({ data: { companyId: session.companyId, clientId, number: "LOCAL", title: "Fictional reader contract", content: "Fictional content" } })).id
    await prisma.expense.create({ data: { companyId: session.companyId, clientId, projectId, label: "Fictional reader expense", amountCents: 1000, date: new Date("2030-01-01"), category: "Matériel" } })
    await prisma.timeEntry.create({ data: { projectId, durationSec: 3600 } })
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign readers company" } })).id
    const foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign reader client" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Fictional foreign reader project" } })).id
    inconsistentProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Fictional inconsistent reader project" } })).id
    inconsistentQuoteId = (await prisma.quote.create({ data: { companyId: session.companyId, clientId: foreignClientId, projectId, number: "INCONSISTENT", object: "Fictional inconsistent reader quote" } })).id
    inconsistentInvoiceId = (await prisma.invoice.create({ data: { companyId: session.companyId, clientId: foreignClientId, projectId, number: "INCONSISTENT", object: "Fictional inconsistent reader invoice", dueDate: new Date("2030-01-01"), totalHtCents: 20000, totalTvaCents: 0, totalTtcCents: 20000 } })).id
    inconsistentContractId = (await prisma.contract.create({ data: { companyId: session.companyId, clientId: foreignClientId, number: "INCONSISTENT", title: "Fictional inconsistent reader contract", content: "Fictional content" } })).id
    await prisma.timeEntry.create({ data: { projectId: inconsistentProjectId, durationSec: 7200 } })
  })
  afterEach(async () => { if (membershipId) await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } }) })
  afterAll(async () => {
    const companies = [session.companyId, foreignCompanyId].filter(Boolean), where = { companyId: { in: companies } }
    if (companies.length) {
      await prisma.expense.deleteMany({ where })
      await prisma.timeEntry.deleteMany({ where: { project: where } })
      await prisma.invoice.deleteMany({ where })
      await prisma.contract.deleteMany({ where })
      await prisma.quote.deleteMany({ where })
      await prisma.project.deleteMany({ where })
      await prisma.client.deleteMany({ where })
      await prisma.company.deleteMany({ where: { id: { in: companies } } })
    }
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } })
  })
  const readers = ["projects", "project", "time", "quote", "contract", "invoice"] as const
  async function read(name: typeof readers[number]) {
    if (name === "projects") return (await getProjects()).find(project => project.id === projectId)?.client
    if (name === "project") return (await getProjectById(projectId))?.client
    if (name === "time") return (await getTimeEntries()).find(entry => entry.projectId === projectId)?.project.client
    if (name === "quote") return (await getQuoteById(quoteId))?.client
    if (name === "contract") return (await getContractById(contractId))?.client
    return (await getInvoiceById(invoiceId))?.client
  }
  it.each(readers.flatMap(reader => Object.keys(values).filter(field => reader !== "invoice" || field !== "renewalAmountCents").map(field => ({ reader, field }))))("omits inaccessible $field from $reader", async ({ reader, field }) => {
    const role = reader === "invoice" ? "VIEWER" : reader === "quote" || reader === "contract" ? "SALES" : "TECHNICIAN"
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await read(reader))?.[field as keyof typeof values]).toBeNull()
  })
  it.each(["TECHNICIAN", "SERVICE"])("does not return project quotes without Sales to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getProjectById(projectId))?.quotes).toEqual([])
  })
  it.each(["SALES", "TECHNICIAN", "SERVICE"])("does not return project invoices without Finance to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getProjectById(projectId))?.invoices).toEqual([])
  })
  it.each(["SALES", "TECHNICIAN", "SERVICE"])("does not return project expenses without Finance to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getProjectById(projectId))?.expenses).toEqual([])
  })
  it.each(["project", "quote", "invoice", "contract"])("refuses an inconsistent foreign client in %s", async reader => {
    const result = reader === "project" ? await getProjectById(inconsistentProjectId) : reader === "quote" ? await getQuoteById(inconsistentQuoteId) : reader === "invoice" ? await getInvoiceById(inconsistentInvoiceId) : await getContractById(inconsistentContractId)
    expect(result).toBeNull()
  })
  it("excludes projects linked to a foreign client from the project list", async () => { expect((await getProjects()).map(project => project.id)).not.toContain(inconsistentProjectId) })
  it("excludes time entries whose project is linked to a foreign client", async () => { expect((await getTimeEntries()).map(entry => entry.projectId)).not.toContain(inconsistentProjectId) })
  it.each(readers)("preserves Owner client values in %s", async reader => { expect(await read(reader)).toMatchObject(values) })
  it.each(readers)("preserves Admin client values in %s", async reader => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ADMIN" } })
    expect(await read(reader)).toMatchObject(values)
  })
  it.each(["VIEWER", "ACCOUNTING"])("preserves authorized Finance with agency-scoped caches for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const project = await getProjectById(projectId)
    expect(project?.client).toMatchObject({ totalRevenueCents: null, totalUnpaidCents: null, relationScore: null, renewalAmountCents: values.renewalAmountCents })
    expect(project?.invoices.map(invoice => invoice.id)).toEqual([invoiceId])
    expect(project?.expenses.map(expense => expense.label)).toEqual(["Fictional reader expense"])
    expect(project?.access.finance).toBe(true)
  })
  it("keeps Sales quotes and operational budget while excluding Finance", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const project = await getProjectById(projectId)
    expect(project?.quotes.map(quote => quote.id)).toEqual([quoteId])
    expect(project).toMatchObject({ budgetCents: 50000, consumedCents: 5000, invoices: [], expenses: [], access: { sales: true, finance: false } })
  })
  it("keeps technician budgets and time without exposing commercial documents", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await getProjectById(projectId)).toMatchObject({ budgetCents: 50000, consumedCents: 5000, quotes: [], invoices: [], expenses: [], access: { sales: false, finance: false } })
    expect((await getTimeEntries()).find(entry => entry.projectId === projectId)?.durationSec).toBe(3600)
  })
  it("keeps coherent Owner documents and excludes inconsistent nested clients", async () => {
    const project = await getProjectById(projectId)
    expect(project?.quotes.map(quote => quote.id)).toEqual([quoteId])
    expect(project?.invoices.map(invoice => invoice.id)).toEqual([invoiceId])
  })
  it("reevaluates permissions after a role change in the same session", async () => {
    expect((await getProjectById(projectId))?.invoices.map(invoice => invoice.id)).toEqual([invoiceId])
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await getProjectById(projectId)).toMatchObject({ quotes: [], invoices: [], expenses: [], client: { totalRevenueCents: null, relationScore: null } })
  })
  it("reevaluates agency revocation in project and time readers", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await getProjectById(projectId)).not.toBeNull()
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await getProjectById(projectId)).toBeNull()
      expect(await getProjects()).toEqual([])
      expect(await getTimeEntries()).toEqual([])
    } finally {
      await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    }
  })
  it("refuses a project of another company", async () => { expect(await getProjectById(foreignProjectId)).toBeNull() })
  it("refuses project consultation after suspension", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getProjectById(projectId)).rejects.toThrow("plus accès")
  })
})
