import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createExpense, getExpenseProjectChoices, updateExpense } from "@/actions/depenses"

describe.sequential("Expense project choices on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, clientId: string, foreignClientId: string, foreignCompanyId: string, olderId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional expense project choices" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign project choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `expense-project-choices-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional local agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional project customer", totalRevenueCents: 900000 } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })).id
  })
  const project = (name: string) => ({ companyId: session.companyId, clientId, agencyId, name })
  beforeEach(async () => {
    olderId = (await prisma.project.create({ data: { ...project("ZZ Ancien chantier"), createdAt: new Date("2000-01-01") } })).id
    await prisma.project.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ ...project(`Recent project ${String(i).padStart(3, "0")}`), createdAt: new Date("2001-01-01") })) })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.expense.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.project.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reaches all 101 projects in bounded pages with a minimal projection", async () => {
    const pages = await Promise.all([1, 2, 3, 4, 5].map(page => getExpenseProjectChoices({ page })))
    expect(pages.map(p => p.items.length)).toEqual([25, 25, 25, 25, 1])
    expect(new Set(pages.flatMap(p => p.items.map(item => item.id))).size).toBe(101)
    expect(pages[4].items).toEqual([{ id: olderId, name: "ZZ Ancien chantier", clientId }])
    for (const page of pages) {
      expect(page.total).toBe(101)
      expect(page.selected).toBeNull()
      for (const item of page.items) expect(Object.keys(item).sort()).toEqual(["clientId", "id", "name"])
    }
  })
  it("keeps equal-name pages deterministic without duplicates", async () => {
    await prisma.project.createMany({ data: Array.from({ length: 26 }, () => project("Same name")) })
    const first = await getExpenseProjectChoices({ search: "Same name" }), second = await getExpenseProjectChoices({ search: "Same name", page: 2 })
    expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(1)
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(26)
    expect((await getExpenseProjectChoices({ search: "Same name" })).items).toEqual(first.items)
  })
  it("finds the older project case-insensitively and keeps a selected project outside the search", async () => {
    expect(await getExpenseProjectChoices({ search: "  ANCIEN  " })).toMatchObject({ total: 1, items: [{ id: olderId }] })
    expect(await getExpenseProjectChoices({ search: "absent", selectedId: olderId, page: 5 })).toEqual({ items: [], total: 0, page: 1, selected: { id: olderId, name: "ZZ Ancien chantier", clientId } })
    expect((await getExpenseProjectChoices({ selectedId: olderId })).selected?.id).toBe(olderId)
  })
  it("clamps an obsolete page and returns an empty first page", async () => {
    expect(await getExpenseProjectChoices({ page: 99999 })).toMatchObject({ page: 5, total: 101, items: [{ id: olderId }] })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    expect(await getExpenseProjectChoices({ page: 5, selectedId: olderId })).toEqual({ items: [], total: 0, page: 1, selected: null })
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"])("scopes rows, totals and the separate selection for %s", async role => {
    const other = await prisma.project.create({ data: { ...project("Other agency"), agencyId: otherAgencyId } })
    await prisma.project.create({ data: { ...project("Unattached"), agencyId: null } })
    const foreign = await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Forbidden company" } })
    const invalid = await prisma.project.create({ data: { ...project("Forbidden client"), clientId: foreignClientId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const global = role === "OWNER" || role === "ADMIN"
    const result = await getExpenseProjectChoices({ selectedId: other.id })
    expect(result.total).toBe(global ? 103 : 101)
    expect(result.selected?.id ?? null).toBe(global ? other.id : null)
    for (const selectedId of [foreign.id, invalid.id]) expect(await getExpenseProjectChoices({ search: "Forbidden", selectedId })).toMatchObject({ items: [], total: 0, selected: null })
  })
  it("applies agency revocation to the selected project as well as the list", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    await prisma.agencyMembership.deleteMany({ where: { agencyId, membershipId } })
    try { expect(await getExpenseProjectChoices({ selectedId: olderId })).toEqual({ items: [], total: 0, page: 1, selected: null }) }
    finally { await prisma.agencyMembership.create({ data: { agencyId, membershipId } }) }
  })
  it.each(["SALES", "OPERATIONS", "SERVICE", "TECHNICIAN"])("requires Finance for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getExpenseProjectChoices({ selectedId: olderId })).rejects.toThrow("droits nécessaires")
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { selectedId: "" }, { selectedId: "x".repeat(101) }, { companyId: "foreign" }])("rejects invalid or injected input: %j", async input => {
    await expect(getExpenseProjectChoices(input)).rejects.toThrow()
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("preserves both project and client when editing from a selection outside the page", async () => {
    const existing = await prisma.expense.create({ data: { companyId: session.companyId, projectId: olderId, clientId, label: "Existing linked expense", amountCents: 1234, date: new Date("2030-01-01"), category: "TEST" } })
    const choice = await getExpenseProjectChoices({ search: "Recent", selectedId: olderId })
    expect(choice.items.some(item => item.id === olderId)).toBe(false)
    const updated = await updateExpense(existing.id, { label: "Edited linked expense", amountCents: existing.amountCents, date: "2030-01-01", category: "TEST", projectId: olderId, clientId: choice.selected!.clientId })
    expect(updated).toMatchObject({ clientId, projectId: olderId, amountCents: 1234, label: "Edited linked expense" })
  })
  it("creates an expense from an older project selected through search", async () => {
    const choice = await getExpenseProjectChoices({ search: "Ancien", selectedId: olderId })
    const created = await createExpense({ label: "New linked expense", amountCents: 1234, date: "2030-01-01", category: "TEST", projectId: choice.selected!.id, clientId: choice.selected!.clientId })
    expect(created).toMatchObject({ projectId: olderId, clientId })
  })
  it("allows read-only demo lookup without creating business data or an audit", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getExpenseProjectChoices({ selectedId: olderId })).selected?.clientId).toBe(clientId)
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(101)
    expect(await prisma.expense.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
