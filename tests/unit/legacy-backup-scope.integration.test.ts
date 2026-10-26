import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { restoreBackupPayload, LEGACY_BACKUP_SCHEMA } from "@/lib/backup"

let companyId = "", foreignCompanyId = "", userId = "", membershipId = "", originalClientId = "", foreignClientId = ""
const importedContactId = randomUUID(), importedClientId = randomUUID()

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: "Fictional legacy workspace" } })
  const foreign = await prisma.company.create({ data: { name: "Fictional foreign workspace" } })
  companyId = company.id; foreignCompanyId = foreign.id
  const user = await prisma.user.create({ data: { companyId, email: `${randomUUID()}@example.test` } })
  userId = user.id
  const membership = await prisma.membership.create({ data: { companyId, userId, role: "OWNER" } })
  membershipId = membership.id
  originalClientId = (await prisma.client.create({ data: { companyId, name: "Original client to preserve" } })).id
  foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign client to preserve" } })).id
})

afterAll(async () => {
  await prisma.contact.deleteMany({ where: { id: importedContactId } })
  await prisma.client.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
  await prisma.membership.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignCompanyId] } } })
})

it("refuses an unverified v2 graph without replacing business data or attaching a contact to another company", async () => {
  const payload = {
    schema: LEGACY_BACKUP_SCHEMA,
    user: { id: userId },
    company: { id: companyId, name: "Fictional imported workspace", clients: [{ id: importedClientId, name: "Fictional imported client", contacts: [{ id: importedContactId, clientId: foreignClientId, firstName: "Fictional", lastName: "Foreign reference" }] }] },
    localFiles: [], notifications: [], auditLogs: [], apiKeys: [],
  }
  const result = await requestContext.run({ userId, companyId, membershipId, role: "OWNER", agencyIds: null, actionPermission: "company.manage" }, async () => {
    return restoreBackupPayload(payload, userId, companyId).catch((error: Error) => error)
  })
  expect(await prisma.contact.findUnique({ where: { id: importedContactId } })).toBeNull()
  expect(await prisma.client.findUnique({ where: { id: originalClientId } })).not.toBeNull()
  expect(await prisma.company.findUnique({ where: { id: companyId } })).toMatchObject({ name: "Fictional legacy workspace" })
  expect(result).toBeInstanceOf(Error)
  expect((result as Error).message).toContain("reprise contrôlée")
  expect(await prisma.client.findUnique({ where: { id: importedClientId } })).toBeNull()
  expect(await prisma.auditLog.count({ where: { userId } })).toBe(0)
})
