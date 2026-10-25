import "server-only"
import type { TransactionClient } from "@/lib/prisma"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"

// All owner-removal paths take this write lock before checking successors.
// A no-op update works on SQLite and PostgreSQL without changing company data.
export async function lockCompanyOwnership(tx: TransactionClient, companyId: string) {
  assertDemoMutationAllowed()
  await tx.$executeRaw`UPDATE "Company" SET "id" = "id" WHERE "id" = ${companyId}`
}
