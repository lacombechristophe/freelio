import "server-only"

import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { activeSiteReferenceWhere } from "./asset-lifecycle"
import { getContext, requestContext } from "@/lib/context"

const querySchema = z.object({
  search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100_000).default(1),
  selectedId: z.string().cuid().optional(), clientId: z.string().cuid().optional(), siteId: z.string().cuid().optional(),
}).strict()
type Row = { id: string; name: string }

export async function readOperationsProjectChoices(context: AuthContext, input: unknown) {
  const query = querySchema.parse(input)
  return prisma.$transaction(async tx => {
    const request = getContext()
    if (!request || request.companyId !== context.companyId || request.actionPermission !== "operations.read") throw new Error("Accès Opérations requis")
    // The caller cannot provide SQL. Only the three SELECTs below are granted
    // this statement-local exception to the public demo's raw-SQL prohibition.
    const read = <T>(statement: Prisma.Sql) => requestContext.run({ ...request, operationsProjectReadSql: statement.sql }, async () => {
      const result = await tx.$queryRaw<T>(statement)
      return result
    })
    const site = query.siteId ? await tx.customerSite.findFirst({
      where: { AND: [activeSiteReferenceWhere(context.companyId, context.agencyIds), { id: query.siteId }] }, select: { clientId: true },
    }) : null
    if (query.siteId && !site) throw new Error("Site introuvable ou inaccessible")
    const agencyFilter = context.agencyIds === null ? Prisma.empty : context.agencyIds.length ? Prisma.sql`
      AND p."agencyId" IN (${Prisma.join(context.agencyIds)})
      AND (p."siteId" IS NULL OR s."agencyId" IN (${Prisma.join(context.agencyIds)}))` : Prisma.sql`AND 1 = 0`
    // Compare the site/client columns before counting and paging; filtering a
    // loaded page would leave gaps and misleading totals for historical data.
    const eligible = Prisma.sql`
      FROM "Project" p
      JOIN "Client" c ON c."id" = p."clientId" AND c."companyId" = ${context.companyId}
      LEFT JOIN "Agency" a ON a."id" = p."agencyId"
      LEFT JOIN "CustomerSite" s ON s."id" = p."siteId"
      LEFT JOIN "Agency" sa ON sa."id" = s."agencyId"
      LEFT JOIN "ProjectTemplate" t ON t."id" = p."projectTemplateId"
      WHERE p."companyId" = ${context.companyId} AND p."status" = 'ACTIVE'
      AND (p."agencyId" IS NULL OR a."companyId" = ${context.companyId})
      AND (p."siteId" IS NULL OR (s."companyId" = ${context.companyId} AND s."clientId" = p."clientId"
        AND (s."agencyId" IS NULL OR sa."companyId" = ${context.companyId})))
      AND (p."projectTemplateId" IS NULL OR t."companyId" = ${context.companyId})
      ${agencyFilter}
      ${query.clientId ? Prisma.sql`AND p."clientId" = ${query.clientId}` : Prisma.empty}
      ${site ? Prisma.sql`AND p."clientId" = ${site.clientId} AND (p."siteId" IS NULL OR p."siteId" = ${query.siteId})` : Prisma.empty}`
    const search = !query.search ? Prisma.empty : process.env.DATABASE_URL?.startsWith("postgres")
      ? Prisma.sql`AND STRPOS(LOWER(p."name"), LOWER(${query.search})) > 0`
      : Prisma.sql`AND INSTR(LOWER(p."name"), LOWER(${query.search})) > 0`
    const [count] = await read<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "total" ${eligible} ${search}`)
    const total = Number(count.total), page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
    const items = await read<Row[]>(Prisma.sql`SELECT p."id", p."name" ${eligible} ${search}
      ORDER BY p."name" ASC, p."id" ASC LIMIT ${DIRECTORY_PAGE_SIZE} OFFSET ${(page - 1) * DIRECTORY_PAGE_SIZE}`)
    const selected = query.selectedId ? await read<Row[]>(Prisma.sql`SELECT p."id", p."name" ${eligible} AND p."id" = ${query.selectedId}`) : []
    const option = (row: Row) => ({ id: row.id, label: row.name })
    return { items: items.map(option), total, page, selected: selected[0] ? option(selected[0]) : null }
  }, { isolationLevel: "Serializable" })
}
