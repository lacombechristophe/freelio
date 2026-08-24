import prisma from "@/lib/prisma"
import { productionConfigurationIssues } from "@/lib/readiness"

export const dynamic = "force-dynamic"

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }

export async function GET() {
  const configurationIssues = productionConfigurationIssues()
  let databaseReady = false

  try {
    await prisma.$queryRaw`SELECT 1`
    databaseReady = true
  } catch {
    databaseReady = false
  }

  const configurationReady = configurationIssues.length === 0
  const ready = databaseReady && configurationReady

  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      components: {
        database: databaseReady ? "ok" : "error",
        configuration: configurationReady ? "ok" : "error",
      },
    },
    { status: ready ? 200 : 503, headers },
  )
}
