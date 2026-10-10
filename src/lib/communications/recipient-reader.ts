import "server-only"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import prisma from "@/lib/prisma"

const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100_000).default(1),
  selectedId: z.string().cuid().optional(),
})
const recipientSelect = { id: true, firstName: true, lastName: true, email: true, client: { select: { id: true, name: true } } } as const satisfies Prisma.ContactSelect

export async function readRecipientPage(companyId: string, input: unknown = {}) {
  const query = querySchema.parse(input)
  // PostgreSQL requires explicit ILIKE; SQLite's LIKE is already ASCII case-insensitive.
  const mode = process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}
  const contains = { contains: query.search, ...mode }
  const eligible: Prisma.ContactWhereInput = { client: { companyId }, email: { not: null }, NOT: { email: "" } }
  const where: Prisma.ContactWhereInput = { ...eligible, ...(query.search ? { OR: [
    { firstName: contains }, { lastName: contains }, { email: contains }, { client: { companyId, name: contains } },
  ] } : {}) }
  return prisma.$transaction(async (tx) => {
    const total = await tx.contact.count({ where })
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
    const contacts = await tx.contact.findMany({ where, select: recipientSelect, orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }], skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE })
    const selectedContact = query.selectedId ? await tx.contact.findFirst({ where: { ...eligible, id: query.selectedId }, select: recipientSelect }) : null
    return { contacts, selectedContact, page, total, search: query.search }
  }, { isolationLevel: "Serializable" })
}
export type RecipientPage = Awaited<ReturnType<typeof readRecipientPage>>
