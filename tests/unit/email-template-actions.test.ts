import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), logAction: vi.fn(), revalidatePath: vi.fn(),
  withAuth: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: mocks.withAuth }))
vi.mock("@/lib/prisma", () => ({ default: { emailTemplate: { create: mocks.create, update: mocks.update, findFirst: mocks.findFirst } } }))
vi.mock("@/lib/audit", () => ({ logAction: mocks.logAction }))
vi.mock("@/lib/automations/sequences", () => ({ enrollLeadInSequenceInternal: vi.fn(), processDueSequenceEmails: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ automationProcessRateLimit: vi.fn() }))

import { createEmailTemplate, updateEmailTemplate } from "@/actions/automations"

const input = { name: "Relance entretien", category: "SERVICE", subject: "Votre entretien annuel", bodyHtml: "<p>Bonjour Camille, préparons la prochaine visite.</p>" }
const templateId = "cm00000000000000000000001"
const conflict = () => new Prisma.PrismaClientKnownRequestError("unique constraint", { code: "P2002", clientVersion: "6.12.0" })

describe("email template mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.withAuth.mockImplementation((action) => action({ companyId: "company-a", userId: "user-a" }))
  })

  it("creates a template in the authorized company and records success", async () => {
    mocks.create.mockResolvedValue({ id: templateId, name: input.name })
    await expect(createEmailTemplate(input)).resolves.toEqual({ success: true })
    expect(mocks.withAuth).toHaveBeenCalledWith(expect.any(Function), "automation.write")
    expect(mocks.create).toHaveBeenCalledWith({ data: { ...input, companyId: "company-a" } })
    expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ resourceId: templateId, userId: "user-a" }))
  })

  it("returns a recoverable conflict, including concurrent creation, without logging success", async () => {
    mocks.create.mockRejectedValue(conflict())
    const result = await createEmailTemplate(input)
    expect(result).toEqual({ success: false, error: expect.stringContaining("déjà ce nom") })
    expect(mocks.logAction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("keeps a conflicting rename recoverable and checks tenant ownership first", async () => {
    mocks.findFirst.mockResolvedValue({ id: templateId })
    mocks.update.mockRejectedValue(conflict())
    await expect(updateEmailTemplate({ ...input, id: templateId })).resolves.toEqual({ success: false, error: expect.stringContaining("déjà ce nom") })
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: templateId, companyId: "company-a", status: "ACTIVE" }, select: { id: true } })
    expect(mocks.logAction).not.toHaveBeenCalled()
  })

  it("does not mutate an unavailable or another company's template", async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(updateEmailTemplate({ ...input, id: templateId })).resolves.toEqual({ success: false, error: expect.stringContaining("plus disponible") })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("does not disguise infrastructure failures as a duplicate name", async () => {
    const failure = new Error("database unavailable")
    mocks.create.mockRejectedValue(failure)
    await expect(createEmailTemplate(input)).rejects.toBe(failure)
    expect(mocks.logAction).not.toHaveBeenCalled()
  })

  it("performs no write when authorization rejects the operation", async () => {
    mocks.withAuth.mockRejectedValue(new Error("Access denied"))
    await expect(createEmailTemplate(input)).rejects.toThrow("Access denied")
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
