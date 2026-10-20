import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { seedRemoteMail } from "../../scripts/seed-remote-mail.mjs"
import { readInboxPage } from "@/lib/communications/inbox-reader"

describe("recorded remote-mail browser fixture", () => {
  it("is repeatable, disconnected and contains distinct local and provider states without exposing BCC", async () => {
    const db = new PrismaClient(), company = await db.company.create({ data: { name: "Fictional browser mail fixture" } })
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test` } })
    try {
      await seedRemoteMail(db, company.id, user.id); await seedRemoteMail(db, company.id, user.id)
      expect(await db.communicationChannel.findFirstOrThrow({ where: { companyId: company.id } })).toMatchObject({ status: "DISCONNECTED", credentialsEncrypted: null, ownerUserId: user.id })
      const inbox = await readInboxPage(company.id)
      expect(inbox.total).toBe(1); expect(inbox.threads[0]).toMatchObject({ status: "CLOSED", unreadCount: 0 })
      const messages = inbox.threads[0].messages
      expect(messages).toHaveLength(3)
      expect(messages.find(row => row.subject.endsWith("observed"))?.remoteObservation).toMatchObject({ presence: "PRESENT", read: false })
      expect(messages.find(row => row.subject.endsWith("missing"))?.remoteObservation).toMatchObject({ presence: "MISSING" })
      expect(messages.find(row => row.subject.endsWith("legacy"))?.remoteObservation).toBeNull()
      expect(JSON.stringify(inbox)).not.toContain("hidden-remote@example.test")
    } finally { await db.company.delete({ where: { id: company.id } }); await db.user.delete({ where: { id: user.id } }); await db.$disconnect() }
  })
})
