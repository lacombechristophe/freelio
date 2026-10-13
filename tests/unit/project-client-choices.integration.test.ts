import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const reads = vi.hoisted(() => ({ transactions: 0 }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key !== "$transaction") return Reflect.get(target, key)
    return (...args: unknown[]) => { reads.transactions++; return Reflect.apply(transaction, real, args) }
  } }) }
})
import prisma from "@/lib/prisma"
import { getProjectClientChoices } from "@/actions/projets/directory"
import { createProject, updateProject } from "@/actions/projets"

describe.sequential("Project client choices cover the full company with a minimal SQL projection", () => {
  let companyId: string, foreignCompanyId: string, foreignClientId: string, membershipId: string, agencyId: string, lastClientId: string
  beforeAll(async () => {
    companyId = session.companyId = (await prisma.company.create({ data: { name: "Fictional project client choices" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign project choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `project-client-choice-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId, name: "Fictional client choice agency", code: "OWN", isDefault: true } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    await prisma.client.createMany({ data: Array.from({ length: 1000 }, (_, index) => ({ companyId, name: `Client ${String(index).padStart(4, "0")}`, totalRevenueCents: 987654321, relationScore: 99 })) })
    lastClientId = (await prisma.client.create({ data: { companyId, name: "ZZ DERNIER CLIENT" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN CLIENT" } })).id
  })
  afterEach(async () => {
    session.companyId = companyId; reads.transactions = 0; vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.project.deleteMany({ where: { companyId } }); await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  const payload = () => ({ clientId: lastClientId, agencyId, name: "Fictional chosen project", description: "Preserved fictional description", budgetCents: 12345 })
  it("reaches the 1001st client without duplicates or financial fields", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 41; page++) {
      const result = await getProjectClientChoices({ page })
      expect(result).toMatchObject({ total: 1001, page, selected: null })
      expect(result.items).toHaveLength(page === 41 ? 1 : 25)
      for (const item of result.items) { expect(Object.keys(item).sort()).toEqual(["id", "name"]); ids.push(item.id) }
    }
    expect(new Set(ids).size).toBe(1001); expect(ids.at(-1)).toBe(lastClientId)
  })
  it("searches the whole company case-insensitively and trims the query", async () => {
    expect(await getProjectClientChoices({ search: "  dernier client  " })).toMatchObject({ total: 1, page: 1, items: [{ id: lastClientId }] })
  })
  it("keeps the selected client separately when a page or search hides it", async () => {
    const expected = { id: lastClientId, name: "ZZ DERNIER CLIENT" }
    const first = await getProjectClientChoices({ selectedId: lastClientId })
    expect(first.items.some(item => item.id === lastClientId)).toBe(false); expect(first.selected).toEqual(expected)
    expect(await getProjectClientChoices({ selectedId: lastClientId, search: "no match", page: 99 })).toEqual({ items: [], total: 0, page: 1, selected: expected })
  })
  it("clamps an obsolete page and keeps equal-name ties stable", async () => {
    expect(await getProjectClientChoices({ page: 999 })).toMatchObject({ total: 1001, page: 41, items: [{ id: lastClientId }] })
    const name = "Fictional same-name choice"
    await prisma.client.createMany({ data: Array.from({ length: 26 }, () => ({ companyId, name })) })
    try {
      const first = await getProjectClientChoices({ search: name }), second = await getProjectClientChoices({ search: name, page: 2 })
      const ids = [...first.items, ...second.items].map(item => item.id)
      expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(1)
      expect(new Set(ids).size).toBe(26); expect(ids).toEqual([...ids].sort())
      expect((await getProjectClientChoices({ search: name })).items).toEqual(first.items)
    } finally { await prisma.client.deleteMany({ where: { companyId, name } }) }
  })
  it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("keeps company-shared clients minimal for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const result = await getProjectClientChoices({ selectedId: lastClientId })
    expect(result).toMatchObject({ total: 1001, selected: { id: lastClientId } })
    for (const item of [...result.items, result.selected!]) expect(Object.keys(item).sort()).toEqual(["id", "name"])
    expect(await getProjectClientChoices({ search: "FOREIGN", selectedId: foreignClientId })).toEqual({ total: 0, page: 1, items: [], selected: null })
  })
  it("returns no selected client once it has been deleted", async () => {
    const temporary = await prisma.client.create({ data: { companyId, name: "Fictional removed choice" } })
    expect((await getProjectClientChoices({ selectedId: temporary.id })).selected?.id).toBe(temporary.id)
    await prisma.client.delete({ where: { id: temporary.id } })
    const alternatives = await getProjectClientChoices({ selectedId: temporary.id, search: "Client 0001" })
    expect(alternatives.selected).toBeNull()
    expect(alternatives.items).toHaveLength(1); expect(alternatives.items[0].name).toBe("Client 0001")
  })
  it("rechecks active membership before reading choices", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } })
    await expect(getProjectClientChoices({ selectedId: lastClientId })).rejects.toThrow("plus accès")
    expect(reads.transactions).toBe(0)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { selectedId: "" }, { companyId: "foreign" }])("rejects malformed input %j before the choice transaction", async input => {
    await expect(getProjectClientChoices(input)).rejects.toThrow(); expect(reads.transactions).toBe(0)
  })
  it.each(["OWNER", "ADMIN", "OPERATIONS", "TECHNICIAN"])("creates and edits a project with the last client for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getProjectClientChoices({ search: "DERNIER" })).items[0].id).toBe(lastClientId)
    const created = await createProject(payload())
    await updateProject(created.id, { ...payload(), description: "Fictional edited description" })
    expect(await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ clientId: lastClientId, agencyId, budgetCents: 12345, description: "Fictional edited description" })
  })
  it("revalidates a foreign choice during creation without a project or audit", async () => {
    expect((await getProjectClientChoices({ selectedId: foreignClientId })).selected).toBeNull()
    await expect(createProject({ ...payload(), clientId: foreignClientId })).rejects.toThrow("Client introuvable")
    expect(await prisma.project.count({ where: { companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("keeps reads available but blocks writes in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getProjectClientChoices({ selectedId: lastClientId })).selected?.id).toBe(lastClientId)
    await expect(createProject(payload())).rejects.toThrow(/démonstration/i)
    expect(await prisma.project.count({ where: { companyId } })).toBe(0)
  })
})
