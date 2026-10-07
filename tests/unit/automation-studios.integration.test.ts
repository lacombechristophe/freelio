import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getAutomationTemplates, getAutomationSequences, getAutomationWorkflows, getAutomationEnrollments, getAutomationSuppressions, getAutomationDashboard } from "@/actions/automations"

describe.sequential("complete automation libraries, enrollments and suppressions under real authorization", () => {
  let companyId: string, foreignCompanyId: string, userId: string, colleagueId: string, memberId: string, mailboxId: string, privateId: string, privateSequenceId: string
  let templates: { id: string; name: string }[], sequences: { id: string; name: string }[], workflows: { id: string; name: string }[]
  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: "Fictional complete studios" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign studios" } })).id
    userId = (await prisma.user.create({ data: { email: `studio-${randomUUID()}@example.test` } })).id
    colleagueId = (await prisma.user.create({ data: { email: `studio-colleague-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId, userId, role: "OWNER" } })).id
    await prisma.membership.create({ data: { companyId: foreignCompanyId, userId, role: "OWNER" } })
    mailboxId = (await prisma.communicationChannel.create({ data: { companyId, provider: "RESEND", visibility: "SHARED", emailAddress: "shared@example.test" } })).id
    privateId = (await prisma.communicationChannel.create({ data: { companyId, provider: "GOOGLE", ownerUserId: colleagueId, visibility: "PRIVATE", emailAddress: "private@example.test" } })).id
    templates = []; sequences = []; workflows = []
    for (let index = 0; index < 201; index++) {
      const suffix = String(index).padStart(3, "0"), updatedAt = new Date(Date.UTC(2000, 0, 1, 0, index))
      if (index < 101) templates.push(await prisma.emailTemplate.create({ data: { companyId, name: `Fictional model ${suffix}`, subject: `Fictional subject ${suffix}`, category: index % 2 ? "SERVICE" : "NURTURE", bodyHtml: "<p>Fictional template</p>", updatedAt }, select: { id: true, name: true } }))
      sequences.push(await prisma.emailSequence.create({ data: { companyId, senderChannelId: mailboxId, name: `Fictional sequence ${suffix}`, description: `Fictional description ${suffix}`, status: index % 2 ? "ACTIVE" : "DRAFT", updatedAt }, select: { id: true, name: true } }))
      workflows.push(await prisma.automationWorkflow.create({ data: { companyId, name: `Fictional workflow ${suffix}`, trigger: "LEAD_CREATED", status: index % 2 ? "ACTIVE" : "DRAFT", actions: [], updatedAt }, select: { id: true, name: true } }))
      if (index < 101) await prisma.emailSuppression.create({ data: { companyId, email: `blocked${suffix}@example.test`, reason: "MANUAL", suppressedAt: updatedAt, details: { private: "FICTIONAL_SUPPRESSION_DETAILS" } } })
    }
    const privateSequence = await prisma.emailSequence.create({ data: { companyId, senderChannelId: privateId, name: "Private studio sequence" } }); privateSequenceId = privateSequence.id
    await prisma.emailSequence.create({ data: { companyId, name: "Archived studio sequence", status: "ARCHIVED" } })
    await prisma.emailTemplate.create({ data: { companyId, name: "Archived studio model", subject: "Archive", category: "SERVICE", bodyHtml: "<p>Archive</p>", status: "ARCHIVED" } })
    await prisma.automationWorkflow.create({ data: { companyId, name: "Archived studio workflow", trigger: "LEAD_CREATED", status: "ARCHIVED", actions: [] } })
    await prisma.emailSequence.create({ data: { companyId: foreignCompanyId, name: "Foreign studio sequence" } })
    for (let index = 0; index < 26; index++) {
      const lead = await prisma.leadCapture.create({ data: { companyId, firstName: "Fiction", lastName: String(index).padStart(3, "0"), email: `enrollment${index}@example.test`, fingerprint: randomUUID(), privacyAccepted: true } })
      await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequences[0].id, leadCaptureId: lead.id, status: "ACTIVE", enrolledAt: new Date(Date.UTC(2000, 0, 1, 0, index)) } })
      if (index === 0) await prisma.emailSequenceEnrollment.create({ data: { sequenceId: privateSequence.id, leadCaptureId: lead.id } })
    }
    session.companyId = companyId; session.userId = userId
  })
  afterEach(async () => { vi.unstubAllEnvs(); session.companyId = companyId; session.userId = userId; await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "ACTIVE" } }); await prisma.communicationChannel.update({ where: { id: mailboxId }, data: { visibility: "SHARED", ownerUserId: null } }) })
  afterAll(async () => { await prisma.company.delete({ where: { id: companyId } }); await prisma.company.delete({ where: { id: foreignCompanyId } }); await prisma.user.deleteMany({ where: { id: { in: [userId, colleagueId] } } }) })
  it("finds model 101 by page/search and keeps an opened model outside the category filter", async () => {
    const last = await getAutomationTemplates({ page: 999 })
    expect(last).toMatchObject({ total: 101, page: 5, pageCount: 5 }); expect(last.rows.map(row => row.id)).toEqual([templates[0].id])
    const found = await getAutomationTemplates({ search: "FICTIONAL SUBJECT 000", category: "NURTURE", selectedId: templates[100].id })
    expect(found.total).toBe(1); expect(found.selected?.id).toBe(templates[100].id)
    expect((await getAutomationTemplates({ search: "model 000", category: "SERVICE" })).total).toBe(0)
  })
  it("finds sequences/scenarios beyond 200 and retains selection outside the searched page", async () => {
    for (const [read, rows] of [[getAutomationSequences, sequences], [getAutomationWorkflows, workflows]] as const) {
      const last = await read({ search: "Fictional", page: 999 })
      expect(last).toMatchObject({ total: 201, page: 9, pageCount: 9 }); expect(last.rows[0].id).toBe(rows[0].id)
      const found = await read({ search: "000", selectedId: rows[200].id, status: "DRAFT" })
      expect(found.total).toBe(1); expect(found.selected?.id).toBe(rows[200].id)
      expect(await read({ search: "missing", page: 9, selectedId: rows[200].id })).toMatchObject({ total: 0, rows: [], page: 1, selected: { id: rows[200].id } })
    }
  })
  it("counts all active enrollments and retrieves the 26th beyond the old 20-row window", async () => {
    const sequence = await getAutomationSequences({ search: "sequence 000" })
    expect(sequence.rows[0]).toMatchObject({ activeEnrollmentCount: 26, _count: { enrollments: 26 } })
    const last = await getAutomationEnrollments({ sequenceId: sequences[0].id, page: 2 })
    expect(last).toMatchObject({ total: 26, page: 2, pageCount: 2 }); expect(last?.rows[0].leadCapture.lastName).toBe("000")
    expect((await getAutomationEnrollments({ sequenceId: sequences[0].id, search: "ENROLLMENT25@", status: "ACTIVE" }))?.total).toBe(1)
    expect((await getAutomationEnrollments({ sequenceId: sequences[0].id, search: "025", status: "PAUSED" }))?.total).toBe(0)
  })
  it("searches all active suppressions with a limited public projection", async () => {
    const last = await getAutomationSuppressions({ page: 99 })
    expect(last).toMatchObject({ total: 101, page: 5 }); expect(last.rows[0].email).toBe("blocked000@example.test")
    expect((await getAutomationSuppressions({ search: "BLOCKED000@" })).total).toBe(1)
    expect(JSON.stringify(last)).not.toContain("FICTIONAL_SUPPRESSION_DETAILS")
  })
  it("protects private sequence details/enrollments and initial dashboard payloads from another member", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    const privateResult = await getAutomationSequences({ search: "Private", selectedId: privateSequenceId })
    expect(privateResult).toMatchObject({ total: 0, rows: [], selected: null })
    expect(await getAutomationEnrollments({ sequenceId: privateSequenceId })).toBeNull()
    const dashboard = await getAutomationDashboard()
    expect(dashboard?.studioTotals).toMatchObject({ templates: 101, sequences: 201, workflows: 201, suppressions: 101 })
    expect(dashboard?.sequences.some(row => row.id === privateSequenceId)).toBe(false)
  })
  it("rereads a selected sequence after its mailbox visibility is revoked", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    expect((await getAutomationSequences({ selectedId: sequences[0].id })).selected?.id).toBe(sequences[0].id)
    await prisma.communicationChannel.update({ where: { id: mailboxId }, data: { visibility: "PRIVATE", ownerUserId: colleagueId } })
    expect(await getAutomationSequences({ selectedId: sequences[0].id })).toMatchObject({ rows: [], total: 0, selected: null })
    expect(await getAutomationEnrollments({ sequenceId: sequences[0].id })).toBeNull()
  })
  it("preserves ordinary tasks but excludes executions linked to a private calendar task", async () => {
    const enrollments = await prisma.emailSequenceEnrollment.findMany({ where: { sequenceId: sequences[0].id }, orderBy: { enrolledAt: "desc" }, take: 2 })
    const step = await prisma.emailSequenceStep.create({ data: { sequenceId: sequences[0].id, position: 0, type: "TASK", subject: "Fictional task", bodyHtml: "", taskTitle: "Fictional shared task" } })
    const shared = await prisma.organisationTask.create({ data: { companyId, title: "Fictional ordinary task" } })
    const hidden = await prisma.organisationTask.create({ data: { companyId, title: "FICTIONAL_PRIVATE_CALENDAR_TASK", calendarChannelId: privateId, calendarProvider: "GOOGLE", calendarExternalId: "fiction-private-event" } })
    for (const [index, task] of [shared, hidden].entries()) await prisma.emailSequenceTask.create({ data: { companyId, enrollmentId: enrollments[index].id, stepId: step.id, organisationTaskId: task.id } })
    // Keep this ACL fixture in the dashboard's legacy selector tranche too;
    // exhaustive studio search/pagination is qualified independently above.
    await prisma.emailSequence.update({ where: { id: sequences[0].id }, data: { updatedAt: new Date() } })
    await prisma.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    const page = await getAutomationEnrollments({ sequenceId: sequences[0].id })
    expect(page?.rows.flatMap(row => row.taskExecutions).map(row => row.organisationTask.id)).toEqual([shared.id])
    const dashboard = await getAutomationDashboard()
    expect(dashboard?.sequences.find(row => row.id === sequences[0].id)?.enrollments.flatMap(row => row.taskExecutions).map(row => row.organisationTask.id)).toEqual([shared.id])
    for (const value of [page, dashboard]) expect(JSON.stringify(value)).not.toMatch(new RegExp(`FICTIONAL_PRIVATE_CALENDAR_TASK|${hidden.id}`))
  })
  it("refuses foreign details and current membership revocation through actual Server Actions", async () => {
    session.companyId = foreignCompanyId
    expect((await getAutomationSequences({ selectedId: sequences[0].id })).selected).toBeNull()
    expect((await getAutomationTemplates({ selectedId: templates[0].id })).selected).toBeNull()
    expect((await getAutomationWorkflows({ selectedId: workflows[0].id })).selected).toBeNull()
    expect(await getAutomationEnrollments({ sequenceId: sequences[0].id })).toBeNull()
    session.companyId = companyId
    await prisma.membership.update({ where: { id: memberId }, data: { status: "SUSPENDED" } })
    await expect(getAutomationTemplates()).rejects.toThrow("accès")
    await expect(getAutomationWorkflows()).rejects.toThrow("accès")
  })
  it("allows only reads in public demo and rejects malformed filters before SQL", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getAutomationTemplates()).total).toBe(101)
    expect((await getAutomationSequences({ search: "Fictional" })).total).toBe(201)
    await expect(getAutomationEnrollments({ sequenceId: "foreign-invalid" })).rejects.toThrow()
    await expect(getAutomationWorkflows({ page: 0 })).rejects.toThrow()
    await expect(getAutomationSuppressions({ search: "x".repeat(201) })).rejects.toThrow()
  })
})
