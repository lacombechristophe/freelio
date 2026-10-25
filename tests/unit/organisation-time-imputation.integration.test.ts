import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const fault = vi.hoisted(() => ({ stage: "", transactions: 0, reads: 0, gate: null as { wait: Promise<void>; release: () => void } | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/communications/calendar-sync", () => ({ deleteOrganisationTaskFromCalendar: vi.fn(), pushOrganisationTaskToCalendar: vi.fn() }))
vi.mock("@/lib/automations/sequences", () => ({ completeSequenceTaskFromOrganisationTask: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  const run = (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => {
    fault.transactions++
    return transaction(tx => callback(new Proxy(tx, { get(target, key) {
      if (!["project", "timeEntry", "organisationTask"].includes(String(key))) return Reflect.get(target, key)
      const delegate = Reflect.get(target, key)
      return new Proxy(delegate, { get(model, operation) {
        if ((key === "project" && operation === "update" && fault.stage === "budget")
          || (key === "timeEntry" && operation === "create" && fault.stage === "time")
          || (key === "organisationTask" && operation === "updateMany" && fault.stage === "task")) {
          return () => { throw new Error(`Fictional ${fault.stage} outage`) }
        }
        if (key === "project" && operation === "findFirst") return async (...args: unknown[]) => {
          const value = await Reflect.apply(Reflect.get(model, operation), model, args)
          if (fault.gate && fault.reads < 2) {
            if (++fault.reads === 2) fault.gate.release()
            await fault.gate.wait
          }
          return value
        }
        return Reflect.get(model, operation)
      } })
    } })), options)
  }
  return { ...prismaModule, default: new Proxy(real, { get(target, key) { return key === "$transaction" ? run : Reflect.get(target, key) } }) }
})
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { createTimeEntryFromOrganisationTask } from "@/actions/organisation"
import { deleteTimeEntry } from "@/actions/temps"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { pushOrganisationTaskToCalendar } from "@/lib/communications/calendar-sync"
import { completeSequenceTaskFromOrganisationTask } from "@/lib/automations/sequences"

describe.sequential("Organisation task imputation is atomic and unique in SQL", () => {
  let membershipId: string, clientId: string, otherClientId: string, foreignClientId: string, projectId: string, invalidProjectId: string, foreignProjectId: string, otherProjectId: string, foreignAgencyProjectId: string, agencyId: string, foreignCompanyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional task imputation" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign task imputation" } })).id
    session.userId = (await prisma.user.create({ data: { email: `task-time-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional assigned agency" } })).id
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    const foreignAgency = await prisma.agency.create({ data: { companyId: foreignCompanyId, code: "FOREIGN", name: "Fictional foreign agency" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional own customer" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional other customer" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional coherent project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Fictional incoherent project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Fictional foreign project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgency.id, name: "Fictional unassigned project" } })).id
    foreignAgencyProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: foreignAgency.id, name: "Fictional foreign agency project" } })).id
  })
  afterEach(async () => {
    fault.stage = ""; fault.transactions = 0; fault.reads = 0; fault.gate = null; vi.clearAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectId, invalidProjectId, foreignProjectId, otherProjectId, foreignAgencyProjectId] } } })
    await prisma.organisationTask.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.project.updateMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } }, data: { consumedCents: 0 } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  const task = (project: string | null = projectId, customer: string | null = clientId, company = session.companyId) => prisma.organisationTask.create({ data: { companyId: company, projectId: project, clientId: customer, title: "Fictional task", estimateMin: 60, scheduledDate: new Date("2030-01-01T12:00:00Z") } })
  const duplicate = { ok: false, error: "Cette tâche a déjà été imputée" }
  async function unchanged(existing: Awaited<ReturnType<typeof task>>) {
    expect(await prisma.organisationTask.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
    expect(await prisma.timeEntry.count({ where: { sourceOrganisationTaskId: existing.id } })).toBe(0)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).consumedCents).toBe(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  }
  it.each(["OWNER", "ADMIN", "OPERATIONS", "TECHNICIAN"])("imputes once with current permissions for %s", async role => {
    const existing = await task()
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await createTimeEntryFromOrganisationTask(existing.id)).toMatchObject({ ok: true })
    const persisted = await prisma.timeEntry.findMany({ where: { sourceOrganisationTaskId: existing.id } })
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({ projectId, durationSec: 3600, description: existing.title, date: existing.scheduledDate, isBillable: true })
    expect(await prisma.organisationTask.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ status: "DONE", timeImputedAt: expect.any(Date) })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).consumedCents).toBe(6250)
    expect(await createTimeEntryFromOrganisationTask(existing.id, 1)).toEqual(duplicate)
    expect(await prisma.timeEntry.findMany({ where: { sourceOrganisationTaskId: existing.id } })).toEqual(persisted)
    expect(pushOrganisationTaskToCalendar).not.toHaveBeenCalled()
    expect(completeSequenceTaskFromOrganisationTask).not.toHaveBeenCalled()
  })
  it.each(["SALES", "SERVICE", "ACCOUNTING", "VIEWER"])("denies %s before starting business SQL", async role => {
    const existing = await task()
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await createTimeEntryFromOrganisationTask(existing.id)).toEqual({ ok: false, error: "Vous n'avez pas les droits nécessaires pour cette action" })
    expect(fault.transactions).toBe(0); await unchanged(existing)
  })
  it.each([-1, 0, 1.5, 1441, NaN, Infinity])("rejects duration %s without changing the task or budget", async minutes => {
    const existing = await task()
    expect(await createTimeEntryFromOrganisationTask(existing.id, minutes)).toMatchObject({ ok: false })
    await unchanged(existing)
  })
  it.each([1, 1440])("accepts the duration boundary %s", async minutes => {
    const existing = await task()
    expect(await createTimeEntryFromOrganisationTask(existing.id, minutes)).toMatchObject({ ok: true })
    expect(await prisma.timeEntry.findFirstOrThrow({ where: { sourceOrganisationTaskId: existing.id } })).toMatchObject({ durationSec: minutes * 60 })
  })
  it.each(["foreign task", "foreign project", "foreign project client", "foreign task client", "different task client", "unassigned agency", "foreign agency", "missing project"])("refuses %s without writes", async kind => {
    const project = kind === "foreign project" ? foreignProjectId : kind === "foreign project client" ? invalidProjectId : kind === "unassigned agency" ? otherProjectId : kind === "foreign agency" ? foreignAgencyProjectId : kind === "missing project" ? null : projectId
    const customer = kind === "foreign task client" ? foreignClientId : kind === "different task client" ? otherClientId : clientId
    const existing = await task(project, customer, kind === "foreign task" ? foreignCompanyId : session.companyId)
    if (kind === "unassigned agency") await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect(await createTimeEntryFromOrganisationTask(existing.id, 60)).toEqual({ ok: false, error: "Tâche introuvable ou chantier inaccessible" })
    await unchanged(existing)
  })
  it("rechecks an agency withdrawal before imputation", async () => {
    const existing = await task()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await createTimeEntryFromOrganisationTask(existing.id)).toEqual({ ok: false, error: "Tâche introuvable ou chantier inaccessible" })
      await unchanged(existing)
    } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it.each(["task", "time", "budget"])("rolls back the whole transaction after a %s outage", async stage => {
    const existing = await task(); fault.stage = stage
    await expect(createTimeEntryFromOrganisationTask(existing.id)).rejects.toThrow(`Fictional ${stage} outage`)
    expect(fault.transactions).toBe(1); await unchanged(existing)
  })
  it("refuses the public read-only demo before a transaction", async () => {
    const existing = await task(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await createTimeEntryFromOrganisationTask(existing.id)).toEqual({ ok: false, error: DEMO_READ_ONLY_MESSAGE })
    expect(fault.transactions).toBe(0); await unchanged(existing)
  })
  it("uses a completed task without inventing an association for an older time", async () => {
    const existing = await task(projectId, null)
    await prisma.organisationTask.update({ where: { id: existing.id }, data: { status: "DONE", estimateMin: null, scheduledDate: null, dueDate: new Date("2030-01-02"), isBillable: false } })
    const historical = await prisma.timeEntry.create({ data: { projectId, durationSec: 3600, description: existing.title, date: existing.scheduledDate! } })
    expect(await createTimeEntryFromOrganisationTask(existing.id)).toMatchObject({ ok: true })
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: historical.id } })).toEqual(historical)
    expect(await prisma.timeEntry.findFirstOrThrow({ where: { sourceOrganisationTaskId: existing.id } })).toMatchObject({ durationSec: 3600, isBillable: false, date: new Date("2030-01-02") })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).consumedCents).toBe(6250)
  })
  it("keeps the task claim after deleting its unbilled time", async () => {
    const existing = await task(); const result = await createTimeEntryFromOrganisationTask(existing.id)
    if (!result.ok) throw new Error(result.error)
    expect(await deleteTimeEntry(result.value)).toEqual({ ok: true, value: null })
    expect(await createTimeEntryFromOrganisationTask(existing.id)).toEqual(duplicate)
    expect(await prisma.timeEntry.count({ where: { projectId } })).toBe(0)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).consumedCents).toBe(0)
  })
  it("keeps the time when its source task is deleted", async () => {
    const existing = await task(); const result = await createTimeEntryFromOrganisationTask(existing.id)
    if (!result.ok) throw new Error(result.error)
    await prisma.organisationTask.delete({ where: { id: existing.id } })
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: result.value } })).toMatchObject({ durationSec: 3600, sourceOrganisationTaskId: null })
  })
  it("enforces uniqueness even on a direct SQL write", async () => {
    const existing = await task(); await createTimeEntryFromOrganisationTask(existing.id)
    await expect(prisma.timeEntry.create({ data: { projectId, durationSec: 60, sourceOrganisationTaskId: existing.id } })).rejects.toMatchObject({ code: "P2002" })
    expect(await prisma.timeEntry.count({ where: { sourceOrganisationTaskId: existing.id } })).toBe(1)
  })
  it("accepts one imputation and refuses the other, with a real PostgreSQL overlap", async () => {
    const existing = await task(), postgres = process.env.DATABASE_URL?.startsWith("postgres")
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve }), deadline = setTimeout(release, 2000)
    if (postgres) fault.gate = { wait, release }
    try {
      const results = postgres ? await Promise.all([createTimeEntryFromOrganisationTask(existing.id), createTimeEntryFromOrganisationTask(existing.id)])
        : [await createTimeEntryFromOrganisationTask(existing.id), await createTimeEntryFromOrganisationTask(existing.id)]
      expect(results.filter(result => result.ok)).toHaveLength(1)
      expect(results.find(result => !result.ok)).toEqual(duplicate)
      if (postgres) { expect(fault.reads).toBe(2); expect(fault.transactions).toBeGreaterThan(2) }
      expect(await prisma.timeEntry.count({ where: { sourceOrganisationTaskId: existing.id } })).toBe(1)
      expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).consumedCents).toBe(6250)
    } finally { release(); clearTimeout(deadline); fault.gate = null }
  })
})
