"use server"

import { withAuth } from "@/lib/auth-wrapper"
import { readStockDirectory, stockDirectoryQuery } from "@/lib/operations/stock-directory"

export async function getOperationsStockDirectory(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => readStockDirectory(companyId, agencyIds, stockDirectoryQuery.parse(input)), "operations.read")
}
