import "server-only"
import { Prisma } from "@prisma/client"
import type { AuthContext } from "@/lib/auth-wrapper"

export const recurringPageSize = 25
const sqlite = () => process.env.DATABASE_URL?.startsWith("file:")

// Prisma cannot compare a related project's clientId with the parent row.
// Keep those equalities and the legacy JSON check in SQL, before pagination.
export function recurringScope({ companyId, agencyIds }: Pick<AuthContext, "companyId" | "agencyIds">) {
  const templateProject = sqlite()
    ? Prisma.sql`json_extract(r."template", '$.projectId')`
    : Prisma.sql`r."template"->>'projectId'`
  const agencies = agencyIds === null ? Prisma.sql`TRUE` : agencyIds.length ? Prisma.sql`
    (r."projectId" IS NOT NULL OR r."maintenanceContractId" IS NOT NULL)
    AND (r."projectId" IS NULL OR p."agencyId" IN (${Prisma.join(agencyIds)}))
    AND (r."maintenanceContractId" IS NULL OR s."agencyId" IN (${Prisma.join(agencyIds)}))`
    : Prisma.sql`FALSE`
  return Prisma.sql`
    FROM "RecurringInvoice" r
    JOIN "Client" c ON c."id" = r."clientId" AND c."companyId" = r."companyId"
    LEFT JOIN "Project" p ON p."id" = r."projectId"
    LEFT JOIN "MaintenanceContract" m ON m."id" = r."maintenanceContractId"
    LEFT JOIN "CustomerSite" s ON s."id" = m."siteId"
    WHERE r."companyId" = ${companyId}
      AND COALESCE(${templateProject}, '') = COALESCE(r."projectId", '')
      AND (r."projectId" IS NULL OR (p."companyId" = r."companyId" AND p."clientId" = r."clientId"))
      AND (r."maintenanceContractId" IS NULL OR (
        m."companyId" = r."companyId" AND m."clientId" = r."clientId"
        AND s."companyId" = r."companyId" AND s."clientId" = r."clientId"))
      AND (${agencies})`
}

export function recurringSearch(search: string) {
  const value = search.toLowerCase()
  if (!value) return Prisma.sql``
  return sqlite()
    ? Prisma.sql`AND (instr(lower(r."label"), ${value}) > 0 OR instr(lower(c."name"), ${value}) > 0)`
    : Prisma.sql`AND (strpos(lower(r."label"), ${value}) > 0 OR strpos(lower(c."name"), ${value}) > 0)`
}
