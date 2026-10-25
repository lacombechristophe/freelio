import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }),
}))
import prisma from "@/lib/prisma"
import { getContactDetail, getContactsDirectory } from "@/actions/contacts"
import { getContactDirectory } from "@/actions/directories"
import { directoryQuerySchema } from "@/lib/directory-query"

describe.sequential("contact nested communication read scope on real SQL", () => {
  let membershipId: string,
    colleagueId: string,
    contactId: string,
    foreignCompanyId: string,
    foreignContactId: string
  let sharedThreadId: string,
    privateThreadId: string,
    colleagueThreadId: string,
    foreignThreadId: string,
    foreignEnrollmentId: string,
    foreignConsentId: string,
    foreignLeadId: string,
    foreignMessageId: string,
    foreignDeliveryId: string
  let localLeadId: string,
    localConsentId: string,
    localPortalId: string,
    foreignPortalId: string,
    inconsistentPortalId: string,
    inconsistentChannelThreadId: string
  let inconsistentChannelDeliveryId: string
  beforeAll(async () => {
    session.companyId = (
      await prisma.company.create({ data: { name: "Fictional contact reader company" } })
    ).id
    session.userId = (
      await prisma.user.create({ data: { email: `contact-read-${randomUUID()}@example.test` } })
    ).id
    colleagueId = (
      await prisma.user.create({
        data: { email: `contact-colleague-${randomUUID()}@example.test` },
      })
    ).id
    membershipId = (
      await prisma.membership.create({
        data: {
          companyId: session.companyId,
          userId: session.userId,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
    ).id
    const client = await prisma.client.create({
      data: { companyId: session.companyId, name: "Fictional contact client" },
    })
    contactId = (
      await prisma.contact.create({
        data: {
          clientId: client.id,
          firstName: "Fictional",
          lastName: "Local",
          email: "local@example.test",
        },
      })
    ).id
    const shared = await prisma.communicationChannel.create({
      data: {
        companyId: session.companyId,
        provider: "GOOGLE",
        emailAddress: "shared@example.test",
        visibility: "SHARED",
      },
    })
    const personal = await prisma.communicationChannel.create({
      data: {
        companyId: session.companyId,
        provider: "GOOGLE",
        ownerUserId: session.userId,
        emailAddress: "personal@example.test",
        visibility: "PRIVATE",
      },
    })
    const colleague = await prisma.communicationChannel.create({
      data: {
        companyId: session.companyId,
        provider: "GOOGLE",
        ownerUserId: colleagueId,
        emailAddress: "colleague@example.test",
        visibility: "PRIVATE",
      },
    })
    for (const [channel, subject] of [
      [shared, "Fictional shared thread"],
      [personal, "Fictional personal thread"],
      [colleague, "Fictional colleague thread"],
    ] as const) {
      const thread = await prisma.emailThread.create({
        data: {
          companyId: session.companyId,
          channelId: channel.id,
          contactId,
          subject,
          messages: {
            create: {
              companyId: session.companyId,
              direction: "INBOUND",
              provider: "GOOGLE",
              fromAddress: "local@example.test",
              toAddresses: [channel.emailAddress],
              subject,
            },
          },
        },
      })
      if (channel.id === shared.id) sharedThreadId = thread.id
      if (channel.id === personal.id) privateThreadId = thread.id
      if (channel.id === colleague.id) colleagueThreadId = thread.id
    }
    const lead = await prisma.leadCapture.create({
      data: {
        companyId: session.companyId,
        clientId: client.id,
        contactId,
        firstName: "Fictional",
        lastName: "Local",
        privacyAccepted: true,
        fingerprint: randomUUID(),
      },
    })
    localLeadId = lead.id
    localConsentId = (
      await prisma.marketingConsent.create({
        data: {
          companyId: session.companyId,
          contactId,
          channel: "EMAIL",
          purpose: "MARKETING",
          status: "GRANTED",
          legalBasis: "CONSENT",
          source: "FICTIONAL",
          proofHash: "fictional-local-proof",
        },
      })
    ).id
    localPortalId = (
      await prisma.clientPortalAccess.create({
        data: {
          companyId: session.companyId,
          clientId: client.id,
          contactId,
          tokenHash: randomUUID(),
          expiresAt: new Date("2030-01-01"),
        },
      })
    ).id
    const sequence = await prisma.emailSequence.create({
      data: { companyId: session.companyId, name: "Fictional local sequence" },
    })
    const enrollment = await prisma.emailSequenceEnrollment.create({
      data: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId },
    })
    await prisma.emailDelivery.create({
      data: {
        companyId: session.companyId,
        channelId: shared.id,
        contactId,
        enrollmentId: enrollment.id,
        recipientEmail: "local@example.test",
        subject: "Fictional local delivery",
        scheduledAt: new Date(),
      },
    })
    foreignCompanyId = (
      await prisma.company.create({ data: { name: "Fictional foreign contact company" } })
    ).id
    const foreignClient = await prisma.client.create({
      data: { companyId: foreignCompanyId, name: "Fictional foreign contact client" },
    })
    foreignContactId = (
      await prisma.contact.create({
        data: { clientId: foreignClient.id, firstName: "Fictional", lastName: "Foreign" },
      })
    ).id
    foreignPortalId = (
      await prisma.clientPortalAccess.create({
        data: {
          companyId: foreignCompanyId,
          clientId: client.id,
          contactId,
          tokenHash: randomUUID(),
          expiresAt: new Date("2030-01-01"),
        },
      })
    ).id
    inconsistentPortalId = (
      await prisma.clientPortalAccess.create({
        data: {
          companyId: session.companyId,
          clientId: foreignClient.id,
          contactId,
          tokenHash: randomUUID(),
          expiresAt: new Date("2030-01-01"),
        },
      })
    ).id
    const foreignChannel = await prisma.communicationChannel.create({
      data: {
        companyId: foreignCompanyId,
        provider: "GOOGLE",
        emailAddress: "foreign@example.test",
        visibility: "SHARED",
      },
    })
    inconsistentChannelThreadId = (
      await prisma.emailThread.create({
        data: {
          companyId: session.companyId,
          channelId: foreignChannel.id,
          contactId,
          subject: "Fictional inconsistent foreign channel",
        },
      })
    ).id
    inconsistentChannelDeliveryId = (
      await prisma.emailDelivery.create({
        data: {
          companyId: session.companyId,
          channelId: foreignChannel.id,
          contactId,
          enrollmentId: enrollment.id,
          recipientEmail: "local@example.test",
          subject: "Fictional inconsistent foreign channel delivery",
          scheduledAt: new Date(),
        },
      })
    ).id
    foreignThreadId = (
      await prisma.emailThread.create({
        data: {
          companyId: foreignCompanyId,
          channelId: shared.id,
          contactId,
          subject: "Fictional foreign thread",
        },
      })
    ).id
    foreignMessageId = (
      await prisma.emailMessage.create({
        data: {
          companyId: foreignCompanyId,
          threadId: sharedThreadId,
          direction: "INBOUND",
          provider: "GOOGLE",
          fromAddress: "foreign@example.test",
          toAddresses: [shared.emailAddress],
          subject: "Fictional inconsistent foreign message",
          createdAt: new Date("2030-01-01"),
        },
      })
    ).id
    const foreignLead = await prisma.leadCapture.create({
      data: {
        companyId: foreignCompanyId,
        contactId,
        firstName: "Fictional",
        lastName: "Foreign",
        privacyAccepted: true,
        fingerprint: randomUUID(),
      },
    })
    foreignLeadId = foreignLead.id
    const foreignSequence = await prisma.emailSequence.create({
      data: { companyId: foreignCompanyId, name: "Fictional foreign sequence" },
    })
    foreignEnrollmentId = (
      await prisma.emailSequenceEnrollment.create({
        data: { sequenceId: foreignSequence.id, leadCaptureId: foreignLead.id, contactId },
      })
    ).id
    foreignDeliveryId = (
      await prisma.emailDelivery.create({
        data: {
          companyId: foreignCompanyId,
          channelId: shared.id,
          contactId,
          enrollmentId: enrollment.id,
          recipientEmail: "local@example.test",
          subject: "Fictional foreign delivery",
          scheduledAt: new Date(),
        },
      })
    ).id
    foreignConsentId = (
      await prisma.marketingConsent.create({
        data: {
          companyId: foreignCompanyId,
          contactId,
          channel: "EMAIL",
          purpose: "MARKETING",
          status: "GRANTED",
          legalBasis: "CONSENT",
          source: "FICTIONAL",
          proofHash: "fictional-cross-company-proof",
        },
      })
    ).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (membershipId)
      await prisma.membership.update({
        where: { id: membershipId },
        data: { role: "OWNER", status: "ACTIVE" },
      })
  })
  afterAll(async () => {
    const companies = [session.companyId, foreignCompanyId].filter(Boolean),
      where = { companyId: { in: companies } }
    if (companies.length) {
      await prisma.emailThread.deleteMany({ where })
      await prisma.emailDelivery.deleteMany({ where })
      await prisma.emailSequence.deleteMany({ where })
      await prisma.marketingConsent.deleteMany({ where })
      await prisma.leadCapture.deleteMany({ where })
      await prisma.contact.deleteMany({ where: { client: where } })
      await prisma.client.deleteMany({ where })
      await prisma.company.deleteMany({ where: { id: { in: companies } } })
    }
    await prisma.user.deleteMany({
      where: { id: { in: [session.userId, colleagueId].filter(Boolean) } },
    })
  })
  it.each(["TECHNICIAN", "ACCOUNTING", "VIEWER"])(
    "does not expose mail without Automations to %s",
    async (role) => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      expect((await getContactDetail(contactId))?.emailThreads).toEqual([])
    },
  )
  it.each(["TECHNICIAN", "ACCOUNTING", "VIEWER"])(
    "does not expose enrollments without Automations to %s",
    async (role) => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      expect((await getContactDetail(contactId))?.sequenceEnrollments).toEqual([])
    },
  )
  it.each(["TECHNICIAN", "ACCOUNTING", "VIEWER"])(
    "does not expose directory engagement counts without Automations to %s",
    async (role) => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      const row = (await getContactDirectory(directoryQuerySchema.parse({}))).rows.find(
        (contact) => contact.id === contactId,
      )
      expect(row?._count).toMatchObject({ emailDeliveries: null, sequenceEnrollments: null })
    },
  )
  it("excludes a foreign thread linked to the local contact", async () => {
    expect(
      (await getContactDetail(contactId))?.emailThreads.map((thread) => thread.id),
    ).not.toContain(foreignThreadId)
  })
  it("excludes a foreign message from the local thread", async () => {
    expect(
      (await getContactDetail(contactId))?.emailThreads
        .flatMap((thread) => thread.messages)
        .map((message) => message.id),
    ).not.toContain(foreignMessageId)
  })
  it("excludes a foreign sequence enrollment linked to the local contact", async () => {
    expect(
      (await getContactDetail(contactId))?.sequenceEnrollments.map((enrollment) => enrollment.id),
    ).not.toContain(foreignEnrollmentId)
  })
  it("excludes a foreign delivery linked to a local enrollment", async () => {
    expect(
      (await getContactDetail(contactId))?.sequenceEnrollments
        .flatMap((enrollment) => enrollment.deliveries)
        .map((delivery) => delivery.id),
    ).not.toContain(foreignDeliveryId)
  })
  it("excludes foreign consent proof linked to the local contact", async () => {
    expect(
      (await getContactDetail(contactId))?.marketingConsents.map((consent) => consent.id),
    ).not.toContain(foreignConsentId)
  })
  it("excludes a foreign lead linked to the local contact", async () => {
    expect((await getContactDetail(contactId))?.leadCaptures.map((lead) => lead.id)).not.toContain(
      foreignLeadId,
    )
  })
  it("counts only the local sequence enrollment in the directory", async () => {
    expect(
      (await getContactDirectory(directoryQuerySchema.parse({}))).rows.find(
        (contact) => contact.id === contactId,
      )?._count.sequenceEnrollments,
    ).toBe(1)
  })
  it("counts only the local delivery in the directory", async () => {
    expect(
      (await getContactDirectory(directoryQuerySchema.parse({}))).rows.find(
        (contact) => contact.id === contactId,
      )?._count.emailDeliveries,
    ).toBe(1)
  })
  it("preserves coherent Owner threads", async () => {
    expect((await getContactDetail(contactId))?.emailThreads.map((thread) => thread.id)).toEqual(
      expect.arrayContaining([sharedThreadId, privateThreadId, colleagueThreadId]),
    )
  })
  it("preserves coherent Admin threads and engagement counts", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ADMIN" } })
    expect((await getContactDetail(contactId))?.emailThreads.map((thread) => thread.id)).toEqual(
      expect.arrayContaining([sharedThreadId, privateThreadId, colleagueThreadId]),
    )
    expect(
      (await getContactDirectory(directoryQuerySchema.parse({}))).rows.find(
        (contact) => contact.id === contactId,
      )?._count,
    ).toEqual({ emailDeliveries: 1, sequenceEnrollments: 1 })
  })
  it.each(["SALES", "OPERATIONS", "SERVICE"])(
    "keeps shared and personal histories for authorized %s",
    async (role) => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      const contact = await getContactDetail(contactId)
      expect(contact?.emailThreads.map((thread) => thread.id).sort()).toEqual(
        [sharedThreadId, privateThreadId].sort(),
      )
      expect(contact?.sequenceEnrollments.map((enrollment) => enrollment.sequence.name)).toEqual([
        "Fictional local sequence",
      ])
      expect(contact?.access.automation).toBe(true)
    },
  )
  it.each(["TECHNICIAN", "ACCOUNTING", "VIEWER"])(
    "also hides engagement counts in the legacy directory from %s",
    async (role) => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      expect(
        (await getContactsDirectory()).find((contact) => contact.id === contactId)?._count,
      ).toEqual({ emailDeliveries: null, sequenceEnrollments: null })
    },
  )
  it("also scopes the authorized legacy directory counts", async () => {
    expect(
      (await getContactsDirectory()).find((contact) => contact.id === contactId)?._count,
    ).toEqual({ emailDeliveries: 1, sequenceEnrollments: 1 })
  })
  it("does not query communication histories or counts without Automations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const threads = vi.spyOn(prisma.emailThread, "findMany")
    const enrollments = vi.spyOn(prisma.emailSequenceEnrollment, "findMany")
    const contacts = vi.spyOn(prisma.contact, "findMany")
    await getContactDetail(contactId)
    await getContactDirectory(directoryQuerySchema.parse({}))
    expect(threads).not.toHaveBeenCalled()
    expect(enrollments).not.toHaveBeenCalled()
    expect(contacts.mock.calls[0]?.[0]?.include?._count).toBe(false)
  })
  it("reevaluates a downgrade in the same session", async () => {
    expect((await getContactDetail(contactId))?.emailThreads).toHaveLength(3)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await getContactDetail(contactId)).toMatchObject({
      emailThreads: [],
      sequenceEnrollments: [],
      access: { automation: false },
    })
  })
  it("keeps CRM consent, origin and portal facts without Automations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const contact = await getContactDetail(contactId)
    expect(contact?.marketingConsents.map((consent) => consent.id)).toEqual([localConsentId])
    expect(contact?.leadCaptures.map((lead) => lead.id)).toEqual([localLeadId])
    expect(contact?.portalAccesses.map((access) => access.id)).toEqual([localPortalId])
  })
  it("excludes portal references whose company or client is inconsistent", async () => {
    const ids = (await getContactDetail(contactId))?.portalAccesses.map((access) => access.id)
    expect(ids).toEqual([localPortalId])
    expect(ids).not.toContain(foreignPortalId)
    expect(ids).not.toContain(inconsistentPortalId)
  })
  it("excludes a local thread linked to a foreign channel", async () => {
    expect(
      (await getContactDetail(contactId))?.emailThreads.map((thread) => thread.id),
    ).not.toContain(inconsistentChannelThreadId)
  })
  it("excludes foreign mailbox deliveries from detail and directory counts", async () => {
    const contact = await getContactDetail(contactId)
    expect(
      contact?.sequenceEnrollments
        .flatMap((enrollment) => enrollment.deliveries)
        .map((delivery) => delivery.id),
    ).not.toContain(inconsistentChannelDeliveryId)
    expect(
      (await getContactDirectory(directoryQuerySchema.parse({}))).rows.find(
        (row) => row.id === contactId,
      )?._count.emailDeliveries,
    ).toBe(1)
  })
  it("filters foreign threads before the thirty-row recent limit", async () => {
    await prisma.emailThread.createMany({
      data: Array.from({ length: 31 }, (_, index) => ({
        companyId: foreignCompanyId,
        contactId,
        subject: `Fictional foreign recent thread ${index}`,
        lastMessageAt: new Date("2035-01-01"),
      })),
    })
    expect(
      (await getContactDetail(contactId))?.emailThreads.map((thread) => thread.id).sort(),
    ).toEqual([sharedThreadId, privateThreadId, colleagueThreadId].sort())
  })
  it("retains the colleague private mailbox restriction for Sales", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect(
      (await getContactDetail(contactId))?.emailThreads.map((thread) => thread.id),
    ).not.toContain(colleagueThreadId)
  })
  it("refuses a foreign contact", async () => {
    expect(await getContactDetail(foreignContactId)).toBeNull()
  })
  it("refuses a suspended membership", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getContactDetail(contactId)).rejects.toThrow("plus accès")
  })
})
