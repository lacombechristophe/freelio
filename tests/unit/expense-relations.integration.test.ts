import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/local-files", () => ({ removeLocalFile: vi.fn() }))
import prisma from "@/lib/prisma"
import { createExpense, deleteExpense, getExpenses, markExpenseJustified, updateExpense } from "@/actions/depenses"
import { removeLocalFile } from "@/lib/local-files"

describe.sequential("Expense relations on real SQL", () => {
  let membershipId: string, agencyId: string, foreignCompanyId: string
  let clientId: string, foreignClientId: string, projectId: string, invalidProjectId: string, foreignProjectId: string, otherProjectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional expense relations" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign expense company" } })).id
    session.userId = (await prisma.user.create({ data: { email: `expense-relations-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional assigned agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional expense client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign expense client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional own project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Fictional inconsistent project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Fictional foreign project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgency.id, name: "Fictional unassigned project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.expense.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.project.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  const input = () => ({ label: "Fictional expense", amountCents: 34000, date: "2026-10-10", category: "TEST", clientId, projectId })
  function expense(client: string | null = clientId, project: string | null = projectId, companyId = session.companyId) {
    return prisma.expense.create({ data: { companyId, label: "Fictional historical expense", amountCents: 34000, date: new Date("2026-10-10"), category: "TEST", clientId: client, projectId: project } })
  }

  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"])("keeps coherent reads and excludes foreign relations for %s", async role => {
    const valid = await expense()
    await expense(foreignClientId)
    await expense(clientId, foreignProjectId)
    await expense(null, invalidProjectId)
    await expense(foreignClientId, foreignProjectId, foreignCompanyId)
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getExpenses()).map(item => item.id)).toEqual([valid.id])
  })
  it("keeps optional unattached expenses for Owner", async () => {
    const valid = await expense(null, null)
    expect((await getExpenses()).map(item => item.id)).toEqual([valid.id])
  })
  it("refuses creation on a project whose client is foreign, without writing or auditing", async () => {
    const create = vi.spyOn(prisma.expense, "create")
    await expect(createExpense({ ...input(), clientId: "", projectId: invalidProjectId })).rejects.toThrow("Chantier introuvable ou inaccessible")
    expect(create).not.toHaveBeenCalled()
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  const actions = [
    ["update", (id: string) => updateExpense(id, input())],
    ["justify", (id: string) => markExpenseJustified(id)],
    ["delete", (id: string) => deleteExpense(id)],
  ] as const
  for (const kind of ["foreign client", "foreign project", "project with foreign client"]) {
    it.each(actions)(`refuses %s for ${kind} without changing the expense, receipt or audit`, async (_name, action) => {
      const row = await expense(kind === "foreign client" ? foreignClientId : clientId, kind === "foreign project" ? foreignProjectId : kind === "project with foreign client" ? invalidProjectId : projectId)
      const file = await prisma.expenseFile.create({ data: { expenseId: row.id, url: "private/fictitious-receipt.pdf" } })
      await expect(action(row.id)).rejects.toThrow("Dépense introuvable")
      expect(await prisma.expense.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
      expect(await prisma.expenseFile.findUnique({ where: { id: file.id } })).not.toBeNull()
      expect(removeLocalFile).not.toHaveBeenCalled()
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
  }
  it.each(["SALES", "OPERATIONS", "SERVICE", "TECHNICIAN"])("denies Finance reads before the expense query for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const read = vi.spyOn(prisma.expense, "findMany")
    await expect(getExpenses()).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled()
  })
  it.each(actions)("denies Viewer %s before reading or writing an expense", async (_name, action) => {
    const row = await expense()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const read = vi.spyOn(prisma.expense, "findFirst")
    await expect(action(row.id)).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled()
    expect(await prisma.expense.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
  })
  it.each(actions)("refuses %s if the client becomes foreign after the initial read", async (_name, action) => {
    const row = await expense()
    const file = await prisma.expenseFile.create({ data: { expenseId: row.id, url: "private/fictitious-receipt.pdf" } })
    const read = prisma.expense.findFirst.bind(prisma.expense)
    vi.spyOn(prisma.expense, "findFirst").mockImplementationOnce((async args => {
      const observed = await read(args)
      await prisma.expense.update({ where: { id: row.id }, data: { clientId: foreignClientId } })
      return observed
    }) as typeof prisma.expense.findFirst)
    await expect(action(row.id)).rejects.toThrow("Dépense introuvable")
    expect(await prisma.expense.findUniqueOrThrow({ where: { id: row.id } })).toEqual({ ...row, clientId: foreignClientId })
    expect(await prisma.expenseFile.findUnique({ where: { id: file.id } })).not.toBeNull()
    expect(removeLocalFile).not.toHaveBeenCalled()
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("preserves a coherent Accounting create/edit/justify/delete path", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    const row = await createExpense(input())
    expect((await getExpenses()).map(item => item.id)).toEqual([row.id])
    expect(await updateExpense(row.id, { ...input(), amountCents: 1200 })).toMatchObject({ amountCents: 1200 })
    await markExpenseJustified(row.id)
    expect(await prisma.expense.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "JUSTIFIED" })
    await prisma.expenseFile.create({ data: { expenseId: row.id, url: "private/fictitious-receipt.pdf" } })
    await deleteExpense(row.id)
    expect(await prisma.expense.findUnique({ where: { id: row.id } })).toBeNull()
    expect(removeLocalFile).toHaveBeenCalledWith("private/fictitious-receipt.pdf")
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(3)
  })
  it("keeps agency filtering and immediately applies its revocation", async () => {
    const valid = await expense()
    await expense(clientId, otherProjectId)
    await expense(null, null)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getExpenses()).map(item => item.id)).toEqual([valid.id])
    await expect(createExpense({ ...input(), projectId: otherProjectId })).rejects.toThrow("Chantier introuvable ou inaccessible")
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await getExpenses()).toEqual([])
      await expect(markExpenseJustified(valid.id)).rejects.toThrow("Dépense introuvable")
    } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("rejects writes in the public read-only demo before the expense lookup", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const read = vi.spyOn(prisma.expense, "findFirst")
    await expect(markExpenseJustified("fictitious-expense")).rejects.toThrow("lecture seule")
    expect(read).not.toHaveBeenCalled()
  })
})
