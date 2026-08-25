"use server"

import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

export async function getContactsDirectory() {
  return withAuth(async ({ companyId }) => {
    const contacts = await prisma.contact.findMany({
      where: { client: { companyId } },
      include: {
        client: { select: { id: true, name: true, type: true } },
        _count: { select: { emailDeliveries: true, sequenceEnrollments: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: 1_000,
    })
    return contacts.map((contact) => ({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() }))
  }, "crm.read")
}
