"use server"

import { withAuth } from "@/lib/auth-wrapper"
import { loadExecutiveReport } from "@/lib/reporting-data"
import { normalizeReportPeriod } from "@/lib/reporting"

export async function getExecutiveReport(period?: number | string) {
  return withAuth((context) => loadExecutiveReport(context, normalizeReportPeriod(period)))
}
