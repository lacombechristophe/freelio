import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
import { exportUserData } from "@/actions/compliance"

const db = new PrismaClient()
describe.sequential("Account export does not become a company-data export", () => {
  let formerCompany: string, activeCompany: string, ownNotification: string
  beforeEach(async () => {
    formerCompany = (await db.company.create({ data: { name: "Fictional former company", fullName: "Private former identity", iban: "FICTIONAL-PRIVATE-BANK-FIELD" } })).id
    activeCompany = (await db.company.create({ data: { name: "Fictional active company" } })).id
    session.companyId = activeCompany
    session.userId = (await db.user.create({ data: { companyId: formerCompany, email: `${randomUUID()}@example.test`, name: "Fictional account profile", passwordHash: "FICTIONAL-PASSWORD-HASH", mfaSecretEncrypted: "FICTIONAL-MFA-SECRET" } })).id
    await db.membership.createMany({ data: [
      { companyId: activeCompany, userId: session.userId, role: "VIEWER", status: "ACTIVE" },
      { companyId: formerCompany, userId: session.userId, role: "OWNER", status: "SUSPENDED" },
    ] })
    for (const companyId of [formerCompany, activeCompany]) {
      const client = await db.client.create({ data: { companyId, name: "Private company client" } })
      await db.contact.create({ data: { clientId: client.id, firstName: "Private", lastName: "Contact", email: "private-client@example.test" } })
      await db.invoice.create({ data: { companyId, clientId: client.id, number: `PRIVATE-${companyId}`, object: "Private invoice content", dueDate: new Date("2030-01-01"), totalHtCents: 12345, totalTvaCents: 0, totalTtcCents: 12345 } })
      const notification = await db.notification.create({ data: { companyId, userId: session.userId, type: "SYSTEM", title: companyId === activeCompany ? "Accessible account notification" : "Private former notification", message: "Fictional notification" } })
      if (companyId === activeCompany) ownNotification = notification.id
    }
    await db.auditLog.create({ data: { userId: session.userId, action: "UPDATE_CLIENT", resource: "CLIENT", resourceId: "private-company-reference", payload: { detail: "Private audit business payload" } } })
  })
  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { userId: session.userId } })
    await db.notification.deleteMany({ where: { userId: session.userId } })
    await db.invoice.deleteMany({ where: { companyId: { in: [formerCompany, activeCompany] } } })
    await db.client.deleteMany({ where: { companyId: { in: [formerCompany, activeCompany] } } })
    await db.membership.deleteMany({ where: { userId: session.userId } })
    await db.user.delete({ where: { id: session.userId } })
    await db.company.deleteMany({ where: { id: { in: [formerCompany, activeCompany] } } })
  })
  afterAll(async () => { await db.$disconnect() })

  it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("exports only account data for %s in the active workspace", async role => {
    await db.membership.updateMany({ where: { companyId: activeCompany, userId: session.userId }, data: { role } })
    const result = await exportUserData()
    expect(result.data).toMatchObject({ id: session.userId, name: "Fictional account profile" })
    expect(result.data?.company).toEqual({ id: activeCompany, name: "Fictional active company" })
    expect(result.data?.notifications.map(row => row.id)).toEqual([ownNotification])
    expect(Object.keys(result.data!.auditLogs[0]).sort()).toEqual(["action", "createdAt", "id"])
    const serialized = JSON.stringify(result)
    for (const privateValue of [formerCompany, "Private company client", "private-client@example.test", "Private invoice content", "FICTIONAL-PRIVATE-BANK-FIELD", "FICTIONAL-PASSWORD-HASH", "FICTIONAL-MFA-SECRET", "private-company-reference", "Private audit business payload", "Private former notification"]) {
      expect(serialized).not.toContain(privateValue)
    }
    expect(await db.invoice.count({ where: { companyId: { in: [formerCompany, activeCompany] } } })).toBe(2)
  })
  it("refuses a revoked current membership before creating an export audit", async () => {
    await db.membership.updateMany({ where: { companyId: activeCompany, userId: session.userId }, data: { status: "SUSPENDED" } })
    await expect(exportUserData()).rejects.toThrow("plus accès")
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
})
