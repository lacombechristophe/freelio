import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { assertAgencyAccess, canAccessAgency, resolveAgencyAccess } from "@/lib/agency-access"
import { requestContext } from "@/lib/context"
import prisma from "@/lib/prisma"

describe("agency authorization", () => {
  it("grants owners and administrators the whole company perimeter", () => {
    expect(resolveAgencyAccess("OWNER", [])).toBeNull()
    expect(resolveAgencyAccess("ADMIN", ["a1"])).toBeNull()
  })

  it("limits operational roles to their explicit active assignments", () => {
    const access = resolveAgencyAccess("OPERATIONS", ["a1", "a1", "a2"])
    expect(access).toEqual(["a1", "a2"])
    expect(canAccessAgency(access, "a1")).toBe(true)
    expect(canAccessAgency(access, "a3")).toBe(false)
    expect(canAccessAgency(resolveAgencyAccess("TECHNICIAN", []), "a1")).toBe(false)
  })

  it("fails closed for absent and cross-agency identifiers", () => {
    expect(() => assertAgencyAccess(["a1"], null)).toThrow("AGENCY_ACCESS_DENIED")
    expect(() => assertAgencyAccess(["a1"], "a2")).toThrow("AGENCY_ACCESS_DENIED")
    expect(() => assertAgencyAccess(["a1"], "a1")).not.toThrow()
  })
})

describe("agency-scoped Prisma boundary", () => {
  const companyId = "agency-scope-test-company"
  const firstAgencyId = "agency-scope-first"
  const secondAgencyId = "agency-scope-second"
  const clientId = "agency-scope-client"

  beforeAll(async () => {
    await prisma.company.create({ data: { id: companyId, name: "Agency scope test", isTvaApplicable: true } })
    await prisma.client.create({ data: { id: clientId, companyId, name: "Agency scope client" } })
    await prisma.agency.createMany({ data: [
      { id: firstAgencyId, companyId, name: "First", code: "FIRST", kind: "MIXED" },
      { id: secondAgencyId, companyId, name: "Second", code: "SECOND", kind: "MIXED" },
    ] })
    await prisma.project.createMany({ data: [
      { id: "agency-scope-project-first", companyId, clientId, agencyId: firstAgencyId, name: "Visible project" },
      { id: "agency-scope-project-second", companyId, clientId, agencyId: secondAgencyId, name: "Hidden project" },
    ] })
  })

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } })
    await prisma.agency.deleteMany({ where: { companyId } })
    await prisma.client.deleteMany({ where: { companyId } })
    await prisma.company.delete({ where: { id: companyId } })
  })

  it("filters reads, blocks cross-agency writes and assigns the sole agency", async () => {
    await requestContext.run({
      userId: "agency-test-user",
      companyId,
      membershipId: "agency-test-membership",
      role: "TECHNICIAN",
      agencyIds: [firstAgencyId],
      actionPermission: "operations.write",
    }, async () => {
      const projects = await prisma.project.findMany({ where: { companyId }, select: { id: true } })
      expect(projects).toEqual([{ id: "agency-scope-project-first" }])
      await expect(prisma.project.findUnique({ where: { id: "agency-scope-project-second" } })).resolves.toBeNull()
      await expect(prisma.project.updateMany({ where: { id: "agency-scope-project-second" }, data: { name: "Forbidden" } })).resolves.toMatchObject({ count: 0 })
      await expect(prisma.project.create({ data: { companyId, clientId, agencyId: secondAgencyId, name: "Forbidden project" } })).rejects.toThrow("AGENCY_ACCESS_DENIED")
      const created = await prisma.project.create({ data: { id: "agency-scope-auto-project", companyId, clientId, name: "Assigned automatically" } })
      expect(created.agencyId).toBe(firstAgencyId)
    })
  })
})
