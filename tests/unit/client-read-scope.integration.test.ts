import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getClientById } from "@/actions/clients"

describe.sequential("client detail preserves document permissions and nested tenant scopes", () => {
  let clientId: string, foreignClientId: string, foreignCompanyId: string, membershipId: string, permittedAgencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional client reader" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign client reader" } })).id
    session.userId = (await prisma.user.create({ data: { email: `client-reader-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional shared customer", totalRevenueCents: 999999, totalUnpaidCents: 888888 } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })).id
    for (const marker of ["PERMITTED", "OTHER", "FOREIGN"]) {
      const companyId = marker === "FOREIGN" ? foreignCompanyId : session.companyId
      const agency = await prisma.agency.create({ data: { companyId, code: marker, name: `Fictional ${marker} agency` } })
      if (marker === "PERMITTED") {
        permittedAgencyId = agency.id
        await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId } })
      }
      // Legacy imports may contain inconsistent foreign relations. Test reads
      // against real SQL without installing an authenticated write context.
      const project = await prisma.project.create({ data: { companyId, agencyId: agency.id, clientId, name: marker } })
      await prisma.quote.create({ data: { companyId, clientId, projectId: project.id, number: marker, object: marker, versions: { create: { version: 1, totalHtCents: 100, totalTvaCents: 0, totalTtcCents: 100 } } } })
      await prisma.invoice.create({ data: { companyId, clientId, projectId: project.id, number: marker, object: marker, dueDate: new Date("2030-01-01"), status: "PAID", totalHtCents: 100, totalTvaCents: 0, totalTtcCents: 100, paidAmountCents: 100 } })
      await prisma.contract.create({ data: { companyId, clientId, number: marker, title: marker, content: `Fictional ${marker} terms` } })
      if (marker === "FOREIGN") {
        // A company-local document must not widen its scope via a foreign project.
        await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: "FOREIGN_PROJECT", object: "Fictional inconsistent project", versions: { create: { version: 1, totalHtCents: 500, totalTvaCents: 0, totalTtcCents: 500 } } } })
        await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: "FOREIGN_PROJECT", object: "Fictional inconsistent project", dueDate: new Date("2030-01-01"), status: "PAID", totalHtCents: 500, totalTvaCents: 0, totalTtcCents: 500, paidAmountCents: 500 } })
      }
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: permittedAgencyId }, data: { active: true } })
    await prisma.agencyMembership.upsert({ where: { agencyId_membershipId: { agencyId: permittedAgencyId, membershipId } }, update: {}, create: { agencyId: permittedAgencyId, membershipId } })
  })
  afterAll(async () => {
    const companyId = { in: [session.companyId, foreignCompanyId] }
    await prisma.contract.deleteMany({ where: { companyId } })
    await prisma.invoice.deleteMany({ where: { companyId } })
    await prisma.quote.deleteMany({ where: { companyId } })
    await prisma.project.deleteMany({ where: { companyId } })
    await prisma.client.deleteMany({ where: { companyId } })
    await prisma.company.deleteMany({ where: { id: companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["OWNER", "ADMIN"])("keeps company-wide %s reads without disclosing foreign nested documents", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const client = await getClientById(clientId)
    expect(client).not.toBeNull()
    expect(client!.projects.map(row => row.name).sort()).toEqual(["OTHER", "PERMITTED"])
    expect(client!.quotes.map(row => row.number).sort()).toEqual(["OTHER", "PERMITTED"])
    expect(client!.invoices.map(row => row.number).sort()).toEqual(["OTHER", "PERMITTED"])
    expect(client!.contracts.map(row => row.number).sort()).toEqual(["OTHER", "PERMITTED"])
    expect(client!.totalRevenueCents).toBe(200)
    expect(client!.access).toEqual({ sales: true, finance: true, salesWrite: true })
  })
  it("keeps Accounting reads within its currently assigned agency", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    const client = await getClientById(clientId)
    expect(client!.projects.map(row => row.name)).toEqual(["PERMITTED"])
    expect(client!.quotes.map(row => row.number)).toEqual(["PERMITTED"])
    expect(client!.invoices.map(row => row.number)).toEqual(["PERMITTED"])
    expect(client!.totalRevenueCents).toBe(100)
  })
  it.each(["TECHNICIAN", "SERVICE"])("does not return Finance or Sales documents to %s through a CRM read", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const client = await getClientById(clientId)
    expect(client!.quotes).toEqual([])
    expect(client!.contracts).toEqual([])
    expect(client!.invoices).toEqual([])
    expect(client!.totalRevenueCents).toBeNull()
    expect(client!.totalUnpaidCents).toBeNull()
    expect(client!.access).toEqual({ sales: false, finance: false, salesWrite: false })
  })
  it("preserves Sales documents and writing rights without returning financial amounts or invoices", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const client = await getClientById(clientId)
    expect(client!.quotes.map(row => row.number)).toEqual(["PERMITTED"])
    expect(client!.contracts.map(row => row.number).sort()).toEqual(["OTHER", "PERMITTED"])
    expect(client!.invoices).toEqual([])
    expect(client!.totalRevenueCents).toBeNull()
    expect(client!.totalUnpaidCents).toBeNull()
    expect(client!.access).toEqual({ sales: true, finance: false, salesWrite: true })
  })
  it("preserves Viewer document reads without giving Sales writing rights", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const client = await getClientById(clientId)
    expect(client!.quotes.map(row => row.number)).toEqual(["PERMITTED"])
    expect(client!.invoices.map(row => row.number)).toEqual(["PERMITTED"])
    expect(client!.totalRevenueCents).toBe(100)
    expect(client!.access).toEqual({ sales: true, finance: true, salesWrite: false })
  })
  it.each(["inactive", "unassigned"])("rereads %s agency access rather than retaining old document visibility", async condition => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    if (condition === "inactive") await prisma.agency.update({ where: { id: permittedAgencyId }, data: { active: false } })
    else await prisma.agencyMembership.deleteMany({ where: { agencyId: permittedAgencyId, membershipId } })
    const client = await getClientById(clientId)
    expect(client!.projects).toEqual([])
    expect(client!.quotes).toEqual([])
    expect(client!.invoices).toEqual([])
    expect(client!.totalRevenueCents).toBe(0)
  })
  it("reads permitted client data in public demo mode without writing", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getClientById(clientId))!.totalRevenueCents).toBe(200)
  })
  it.each([undefined, null, "", " ", "x".repeat(201)])("does not read a first client from malformed ID %s", async id => {
    expect(await getClientById(id as string)).toBeNull()
  })
  it("refuses a foreign client even when its ID is supplied directly", async () => {
    expect(await getClientById(foreignClientId)).toBeNull()
  })
  it("refuses a suspended membership before reading client detail", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getClientById(clientId)).rejects.toThrow("plus accès")
  })
})
