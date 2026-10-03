import { afterAll, describe, expect, it, vi } from "vitest"

const context = vi.hoisted(() => ({ companyId: "" }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: (task: (value: typeof context) => unknown) => task(context) }))

import prisma from "@/lib/prisma"
import { refreshMarketingIntelligence } from "@/actions/marketing"

describe.sequential("complete, atomic marketing rebuild", () => {
  const companies: string[] = []
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
  })

  it.each([5_001, 10_001])("scores and retains all %i eligible leads beyond the first batch", async (count) => {
    const company = await prisma.company.create({ data: { name: `Marketing volume ${count}` } })
    companies.push(company.id)
    context.companyId = company.id
    for (let offset = 0; offset < count; offset += 400) {
      await prisma.leadCapture.createMany({ data: Array.from({ length: Math.min(400, count - offset) }, (_, index) => ({
        id: `${company.id}-${String(offset + index).padStart(6, "0")}`, companyId: company.id,
        firstName: "Fiction", lastName: String(offset + index), source: "RECIPE", status: "QUALIFIED", privacyAccepted: true, fingerprint: `recipe-${offset + index}`,
      })) })
    }
    const lastLeadId = `${company.id}-${String(count - 1).padStart(6, "0")}`
    const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Qualified", filters: { minScore: 40 }, memberships: { create: { leadCaptureId: lastLeadId } } } })
    const result = await refreshMarketingIntelligence()
    expect(result.scored).toBe(count)
    expect(await prisma.leadCapture.count({ where: { companyId: company.id, score: 40 } })).toBe(count)
    expect(await prisma.marketingSegmentMember.count({ where: { segmentId: segment.id } })).toBe(count)
    expect(await prisma.marketingSegmentMember.findUnique({ where: { segmentId_leadCaptureId: { segmentId: segment.id, leadCaptureId: lastLeadId } } })).not.toBeNull()
  }, 120_000)

  it("preserves previous scores and memberships when a later segment is invalid", async () => {
    const company = await prisma.company.create({ data: { name: "Atomic marketing failure" } })
    companies.push(company.id)
    context.companyId = company.id
    const lead = await prisma.leadCapture.create({ data: { companyId: company.id, firstName: "Fiction", lastName: "Rollback", status: "QUALIFIED", source: "RECIPE", score: 7, privacyAccepted: true, fingerprint: "rollback" } })
    const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Previous generation", filters: { minScore: 100 }, memberships: { create: { leadCaptureId: lead.id } } } })
    await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Invalid imported rule", filters: { createdWithinDays: -1 } } })
    await expect(refreshMarketingIntelligence()).rejects.toThrow()
    expect((await prisma.leadCapture.findUniqueOrThrow({ where: { id: lead.id } })).score).toBe(7)
    expect(await prisma.marketingSegmentMember.count({ where: { segmentId: segment.id } })).toBe(1)
    expect((await prisma.marketingSegment.findUniqueOrThrow({ where: { id: segment.id } })).lastBuiltAt).toBeNull()
  })
})
