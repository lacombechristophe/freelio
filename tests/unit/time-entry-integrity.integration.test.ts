import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const fault = vi.hoisted(() => ({ budget: false, transactions: 0, reads: 0, gate: null as { wait: Promise<void>; release: () => void } | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  const run = (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => {
    fault.transactions++
    return transaction(tx => callback(new Proxy(tx, { get(target, key) {
      if (key !== "project") return Reflect.get(target, key)
      return new Proxy(target.project, { get(delegate, operation) {
        if (operation === "update" && fault.budget) return () => { throw new Error("Fictional budget outage") }
        if (operation === "findFirst") return async (...args: unknown[]) => {
          const value = await Reflect.apply(Reflect.get(delegate, operation), delegate, args)
          if (fault.gate && fault.reads < 2) {
            if (++fault.reads === 2) fault.gate.release()
            await fault.gate.wait
          }
          return value
        }
        return Reflect.get(delegate, operation)
      } })
    } })), options)
  }
  return { ...prismaModule, default: new Proxy(real, { get(target, key) { return key === "$transaction" ? run : Reflect.get(target, key) } }) }
})
import prisma from "@/lib/prisma"
import { createTimeEntry, deleteTimeEntry, updateTimeEntry } from "@/actions/temps"
import { revalidatePath } from "next/cache"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"

describe.sequential("Time mutations preserve SQL integrity", () => {
  let membershipId: string, clientId: string, projectId: string, invalidProjectId: string, foreignProjectId: string, otherProjectId: string, agencyId: string, foreignCompanyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional time integrity" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign time integrity" } })).id
    session.userId = (await prisma.user.create({ data: { email: `time-integrity-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional assigned agency" } })).id
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional unassigned agency" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional own customer" } })).id
    const foreign = await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional own project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreign.id, agencyId, name: "Fictional incoherent project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreign.id, name: "Fictional foreign project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgency.id, name: "Fictional unassigned project" } })).id
  })
  afterEach(async () => {
    fault.budget = false; fault.transactions = 0; fault.gate = null; fault.reads = 0; vi.clearAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectId, invalidProjectId, foreignProjectId, otherProjectId] } } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.updateMany({ where: { companyId: session.companyId }, data: { consumedCents: 0 } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  const input = () => ({ projectId, durationSec: 60, date: new Date("2030-01-01"), description: "Fictional work" })
  const row = (project = projectId) => prisma.timeEntry.create({ data: { projectId: project, durationSec: 60 } })
  const actions = [
    ["create", (_id: string, project = projectId) => createTimeEntry({ ...input(), projectId: project })],
    ["update", (id: string) => updateTimeEntry(id, { durationSec: 120 })],
    ["delete", (id: string) => deleteTimeEntry(id)],
  ] as const
  async function budget() { return (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).consumedCents }

  it.each(["OWNER", "ADMIN", "OPERATIONS", "TECHNICIAN"])("keeps the coherent lifecycle and billable budget for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const created = await createTimeEntry(input())
    expect(created.ok).toBe(true); if (!created.ok) throw new Error(created.error)
    expect(await budget()).toBe(104)
    expect(await updateTimeEntry(created.value.id, { durationSec: 120 })).toMatchObject({ ok: true, value: { durationSec: 120 } })
    expect(await budget()).toBe(208)
    expect(await updateTimeEntry(created.value.id, { isBillable: false })).toMatchObject({ ok: true })
    expect(await budget()).toBe(0)
    expect(await deleteTimeEntry(created.value.id)).toEqual({ ok: true, value: null })
    expect(await prisma.timeEntry.count({ where: { projectId } })).toBe(0)
  })
  for (const role of ["SALES", "SERVICE", "ACCOUNTING", "VIEWER"]) {
    it.each(actions)(`denies %s before business SQL for ${role}`, async (_name, action) => {
      const existing = await row()
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      expect(await action(existing.id)).toEqual({ ok: false, error: "Vous n'avez pas les droits nécessaires pour cette action" })
      expect(fault.transactions).toBe(0)
      expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
      expect(revalidatePath).not.toHaveBeenCalled()
    })
  }
  for (const durationSec of [-60, 0, 1.5, 2147483648, NaN, Infinity]) {
    it(`rejects invalid duration ${durationSec} in create and update without effects`, async () => {
      const existing = await row()
      expect(await createTimeEntry({ ...input(), durationSec })).toMatchObject({ ok: false })
      expect(await updateTimeEntry(existing.id, { durationSec })).toMatchObject({ ok: false })
      expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
      expect(await budget()).toBe(0)
      expect(revalidatePath).not.toHaveBeenCalled()
    })
  }
  it.each([{ date: new Date(NaN) }, { date: "2030-01-01" }, { description: "x".repeat(2001) }, { isBillable: "true" }, { invoiceId: "injected" }])("rejects invalid or injected fields %j", async fields => {
    const existing = await row()
    expect(await createTimeEntry({ ...input(), ...fields })).toMatchObject({ ok: false })
    expect(await updateTimeEntry(existing.id, fields)).toMatchObject({ ok: false })
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
  })
  for (const kind of ["foreign project", "foreign client", "unassigned agency"]) {
    it.each(actions)(`refuses %s through ${kind} without partial writes`, async (name, action) => {
      const project = kind === "foreign project" ? foreignProjectId : kind === "foreign client" ? invalidProjectId : otherProjectId
      const existing = await row(project)
      if (kind === "unassigned agency") await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
      expect(await action(existing.id, project)).toEqual({ ok: false, error: name === "create" ? "Projet introuvable" : "Entrée introuvable" })
      expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
      expect(await budget()).toBe(0)
      expect(revalidatePath).not.toHaveBeenCalled()
    })
  }
  it("applies agency revocation on the next write", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect(await createTimeEntry(input())).toEqual({ ok: false, error: "Projet introuvable" }) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it.each(["update", "delete"])("keeps a draft invoice and its allocated time on %s refusal", async name => {
    const invoice = await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), object: "Fictional draft", status: "DRAFT", totalHtCents: 1000, totalTvaCents: 0, totalTtcCents: 1000, dueDate: new Date("2030-01-01") } })
    const existing = await prisma.timeEntry.create({ data: { projectId, durationSec: 60, invoiceId: invoice.id } })
    expect(await (name === "update" ? updateTimeEntry(existing.id, { durationSec: 120 }) : deleteTimeEntry(existing.id))).toEqual({ ok: false, error: "Ce temps est déjà rattaché à une facture. Il ne peut être modifié ni supprimé." })
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(invoice)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it.each(actions)("rolls back %s when the real transaction cannot update the budget", async (_name, action) => {
    const existing = await row()
    fault.budget = true
    await expect(action(existing.id)).rejects.toThrow("Fictional budget outage")
    expect(fault.transactions).toBe(1)
    expect(await prisma.timeEntry.findMany({ where: { projectId } })).toEqual([existing])
    expect(await budget()).toBe(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it.each(actions)("refuses public-demo %s before a transaction", async (_name, action) => {
    const existing = await row()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await action(existing.id)).toEqual({ ok: false, error: DEMO_READ_ONLY_MESSAGE })
    expect(fault.transactions).toBe(0)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
  })
  it("keeps the persisted budget equal to both accepted writes, including a PostgreSQL overlap", async () => {
    const postgres = process.env.DATABASE_URL?.startsWith("postgres")
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const deadline = setTimeout(release, 2000)
    if (postgres) fault.gate = { wait, release }
    try {
      const results = postgres
        ? await Promise.all([createTimeEntry(input()), createTimeEntry({ ...input(), durationSec: 120 })])
        : [await createTimeEntry(input()), await createTimeEntry({ ...input(), durationSec: 120 })]
      expect(results.every(result => result.ok)).toBe(true)
      if (postgres) { expect(fault.reads).toBe(2); expect(fault.transactions).toBeGreaterThan(2) }
      const persisted = await prisma.timeEntry.findMany({ where: { projectId } })
      expect(persisted).toHaveLength(2)
      expect(persisted.reduce((sum, entry) => sum + entry.durationSec, 0)).toBe(180)
      expect(await budget()).toBe(313)
    } finally { release(); clearTimeout(deadline); fault.gate = null }
  })
})
