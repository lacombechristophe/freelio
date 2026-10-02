import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const context = vi.hoisted(() => ({ companyId: "", userId: "recipe-user" }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: (task: (value: typeof context) => unknown) => task(context) }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))

import prisma from "@/lib/prisma"
import { updateAutomationWorkflowStatus } from "@/actions/automations"

describe.sequential("workflow publication on the actual SQL provider", () => {
  let id: string
  const actions = [
    { type: "CONDITIONAL_BRANCH", label: "Coverage branch", conditions: { projectTypeContains: "coverage", marketingOptIn: true }, ifTrue: [{ type: "UPDATE_LEAD_STATUS", status: "QUALIFIED" }], ifFalse: [{ type: "NOTIFY_TEAM", title: "Check lead" }] },
    { type: "NOTIFY_TEAM", title: "Published action" },
  ]
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "Workflow publication recipe" } })
    context.companyId = company.id
    const workflow = await prisma.automationWorkflow.create({ data: { companyId: company.id, name: "Nested JSON recipe", trigger: "EMAIL_CLICKED", status: "DRAFT", actions, versions: { create: { companyId: company.id, version: 1, status: "DRAFT", trigger: "EMAIL_CLICKED", actions } } } })
    id = workflow.id
  })
  afterAll(async () => {
    if (context.companyId) await prisma.company.delete({ where: { id: context.companyId } })
  })

  it("publishes the unchanged JSONB draft once, even when object keys are reordered", async () => {
    await updateAutomationWorkflowStatus(id, "ACTIVE")
    let workflow = await prisma.automationWorkflow.findUniqueOrThrow({ where: { id }, include: { versions: true } })
    expect(workflow.publishedVersion).toBe(1)
    expect(workflow.versions).toHaveLength(1)
    expect(workflow.versions[0].status).toBe("PUBLISHED")
    const publishedAt = workflow.versions[0].publishedAt?.getTime()
    await updateAutomationWorkflowStatus(id, "ACTIVE")
    workflow = await prisma.automationWorkflow.findUniqueOrThrow({ where: { id }, include: { versions: true } })
    expect(workflow.versions).toHaveLength(1)
    expect(workflow.versions[0].publishedAt?.getTime()).toBe(publishedAt)
  })

  it("creates a new immutable snapshot when action order actually changes", async () => {
    await prisma.automationWorkflow.update({ where: { id }, data: { actions: [...actions].reverse() } })
    await updateAutomationWorkflowStatus(id, "ACTIVE")
    const workflow = await prisma.automationWorkflow.findUniqueOrThrow({ where: { id }, include: { versions: { orderBy: { version: "asc" } } } })
    expect(workflow.publishedVersion).toBe(2)
    expect(workflow.versions).toHaveLength(2)
    expect(workflow.versions[0].actions).toEqual(actions)
    expect(workflow.versions[0].status).toBe("SUPERSEDED")
    expect(workflow.versions[1].actions).toEqual([...actions].reverse())
  })
})
