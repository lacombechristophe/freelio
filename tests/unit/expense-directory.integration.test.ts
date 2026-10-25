import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { deleteExpense, getExpenseDirectory, markExpenseJustified } from "@/actions/depenses"

describe.sequential("Expense directory on real SQL", () => {
  let membershipId: string, agencyId: string, otherProjectId: string, projectId: string
  let clientId: string, foreignClientId: string, invalidProjectId: string, foreignProjectId: string, foreignCompanyId: string, olderId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional expense directory", serviceTimezone: "Europe/Paris" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign expense directory" } })).id
    session.userId = (await prisma.user.create({ data: { email: `expense-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional local agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional directory client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign directory client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional accessible project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgency.id, name: "Fictional other project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Fictional invalid project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Fictional foreign project" } })).id
  })
  const row = (label: string, amountCents = 100) => ({ companyId: session.companyId, clientId, projectId, label, amountCents, category: "TEST", status: "TO_JUSTIFY", date: new Date("2026-06-02T00:00:00.000Z") })
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-05-31T22:30:00.000Z"))
    olderId = (await prisma.expense.create({ data: { ...row("Ancienne dépense", 9900), provider: "Bureau Unique", date: new Date("2026-06-01T00:00:00.000Z") } })).id
    await prisma.expense.createMany({ data: Array.from({ length: 50 }, (_, index) => row(`Recent expense ${index}`)) })
  })
  afterEach(async () => {
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.expense.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.company.update({ where: { id: session.companyId }, data: { serviceTimezone: "Europe/Paris" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })

  it("reaches all 51 rows with stable equal-date pages and complete independent cards", async () => {
    // Page completeness is independent of concurrent transaction scheduling.
    // SQLite starts each interactive read transaction with BEGIN IMMEDIATE.
    const pages = []
    for (const page of [1, 2, 3]) pages.push(await getExpenseDirectory({ page }))
    expect(pages.map(page => page.items.length)).toEqual([25, 25, 1])
    expect(new Set(pages.flatMap(page => page.items.map(item => item.id))).size).toBe(51)
    expect(pages[2].items[0].id).toBe(olderId)
    for (const page of pages) expect(page).toMatchObject({ total: 51, summary: { total: 51, month: "2026-06", thisMonthTotalCents: 14900, toJustify: 51 } })
    expect((await getExpenseDirectory()).items.map(item => item.id)).toEqual(pages[0].items.map(item => item.id))
  })
  it.each(["  ANCIENNE  ", "bureau UNIQUE"])("finds an older label or provider across the complete history: %s", async search => {
    const result = await getExpenseDirectory({ search })
    expect(result.items.map(item => item.id)).toEqual([olderId])
    expect(result).toMatchObject({ total: 1, page: 1, summary: { total: 51, thisMonthTotalCents: 14900, toJustify: 51 } })
  })
  it("clamps an obsolete last page and keeps cards when search has no result", async () => {
    expect(await getExpenseDirectory({ page: 99999 })).toMatchObject({ page: 3, total: 51, items: [{ id: olderId }] })
    expect(await getExpenseDirectory({ search: "absent", page: 3 })).toMatchObject({ items: [], total: 0, page: 1, summary: { total: 51, thisMonthTotalCents: 14900, toJustify: 51 } })
  })
  it("refreshes complete cards after justification and clamps the page after deleting its last row", async () => {
    await markExpenseJustified(olderId)
    expect((await getExpenseDirectory({ page: 3 })).summary).toMatchObject({ thisMonthTotalCents: 14900, toJustify: 50 })
    await deleteExpense(olderId)
    expect(await getExpenseDirectory({ page: 3 })).toMatchObject({ total: 50, page: 2, summary: { total: 50, thisMonthTotalCents: 5000, toJustify: 50 } })
  })
  it("returns an empty first page and zero cards for an empty authorized history", async () => {
    await prisma.expense.deleteMany({ where: { companyId: session.companyId } })
    expect(await getExpenseDirectory({ page: 3 })).toMatchObject({ total: 0, page: 1, items: [], summary: { total: 0, thisMonthTotalCents: 0, toJustify: 0 } })
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"])("applies the same company, relation and agency scope to rows and cards for %s", async role => {
    await prisma.expense.createMany({ data: [
      { ...row("Other agency", 90000), projectId: otherProjectId },
      { ...row("Unattached", 80000), clientId: null, projectId: null },
      { ...row("Forbidden client", 70000), clientId: foreignClientId },
      { ...row("Forbidden project", 70000), projectId: foreignProjectId },
      { ...row("Forbidden project client", 70000), projectId: invalidProjectId },
      { ...row("Forbidden company", 70000), companyId: foreignCompanyId, clientId: foreignClientId, projectId: foreignProjectId },
    ] })
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const global = role === "OWNER" || role === "ADMIN"
    const total = global ? 53 : 51
    const result = await getExpenseDirectory({ search: "Forbidden" })
    expect(result).toMatchObject({ total: 0, items: [], summary: { total, toJustify: total, thisMonthTotalCents: global ? 184900 : 14900 } })
    expect((await getExpenseDirectory()).total).toBe(total)
  })
  it("immediately removes rows, amounts and counts after agency access is revoked", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    await prisma.agencyMembership.deleteMany({ where: { agencyId, membershipId } })
    try { expect(await getExpenseDirectory()).toMatchObject({ total: 0, items: [], summary: { total: 0, thisMonthTotalCents: 0, toJustify: 0 } }) }
    finally { await prisma.agencyMembership.create({ data: { agencyId, membershipId } }) }
  })
  it.each(["SALES", "OPERATIONS", "SERVICE", "TECHNICIAN"])("denies %s before querying expense rows, aggregates or company settings", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const reads = [vi.spyOn(prisma.expense, "findMany"), vi.spyOn(prisma.expense, "count"), vi.spyOn(prisma.expense, "aggregate"), vi.spyOn(prisma.company, "findUniqueOrThrow")]
    await expect(getExpenseDirectory()).rejects.toThrow("droits nécessaires")
    for (const read of reads) expect(read).not.toHaveBeenCalled()
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { companyId: "foreign" }])("rejects an invalid or injected directory query: %j", async input => {
    const reads = [vi.spyOn(prisma.expense, "findMany"), vi.spyOn(prisma.expense, "count"), vi.spyOn(prisma.expense, "aggregate"), vi.spyOn(prisma.company, "findUniqueOrThrow")]
    await expect(getExpenseDirectory(input)).rejects.toThrow()
    for (const read of reads) expect(read).not.toHaveBeenCalled()
  })
  it.each([
    ["Europe/Paris", "2026-05-31T22:30:00Z", "2026-06"],
    ["America/Los_Angeles", "2026-06-01T01:30:00Z", "2026-05"],
    ["Pacific/Kiritimati", "2026-12-31T10:30:00Z", "2027-01"],
    ["America/Los_Angeles", "2027-01-01T01:30:00Z", "2026-12"],
    ["Europe/Paris", "2026-10-25T01:30:00Z", "2026-10"],
  ])("uses the company's civil month in %s at %s, independently of the host clock zone", async (serviceTimezone, now, month) => {
    await prisma.company.update({ where: { id: session.companyId }, data: { serviceTimezone } })
    vi.setSystemTime(new Date(now))
    const start = new Date(`${month}-01T00:00:00Z`), end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    await prisma.expense.createMany({ data: [
      { ...row("Previous month", 700), date: new Date(start.getTime() - 86400000), status: "JUSTIFIED" },
      { ...row("First day", 1000), date: start },
      { ...row("Last day", 2000), date: new Date(end.getTime() - 86400000) },
      { ...row("Next month", 3000), date: end },
    ] })
    expect((await getExpenseDirectory({ search: "absent" })).summary).toEqual({ total: 55, month, thisMonthTotalCents: (month === "2026-06" ? 14900 : 0) + 3000, toJustify: 54 })
  })
  it("keeps the directory readable in the public read-only demo without writes", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getExpenseDirectory({ page: 3 })).items[0].id).toBe(olderId)
    expect(await prisma.expense.count({ where: { companyId: session.companyId } })).toBe(51)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
