import prisma from "@/lib/prisma"
import { productionConfigurationIssues } from "@/lib/readiness"
import { databaseSchemaReady } from "@/lib/schema-readiness"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }

export async function GET() {
  const configurationIssues = productionConfigurationIssues()
  const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? ""
  let databaseReady = false
  let schemaReady = false
  const connectivityStarted = performance.now()

  try {
    await prisma.$queryRaw`SELECT 1`
    databaseReady = true
  } catch (error) {
    databaseReady = false
    const failure = error as { code?: unknown; name?: unknown; meta?: { driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } } } } | null | undefined
    const cause = failure?.meta?.driverAdapterError?.cause
    const code = failure?.code
    const driverCode = cause?.originalCode
    const kind = cause?.kind
    const name = failure?.name
    logger.warn({
      event: "database_readiness_failed",
      errorName: typeof name === "string" && /^(Error|TypeError|RangeError|DriverAdapterError|PrismaClient(KnownRequest|UnknownRequest|Initialization|Validation)Error)$/.test(name) ? name : "unclassified",
      connectionTimeout: error instanceof Error && ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(error.message),
      elapsedMilliseconds: Math.max(0, Math.round(performance.now() - connectivityStarted)),
      errorCode: typeof code === "string" && /^(P\d{4}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)$/.test(code) ? code : "unclassified",
      driverCode: typeof driverCode === "string" && /^([0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID)$/.test(driverCode) ? driverCode : "unclassified",
      driverKind: typeof kind === "string" && /^(DatabaseNotReachable|DatabaseDoesNotExist|DatabaseAccessDenied|ConnectionClosed|TlsConnectionError|AuthenticationFailed|TooManyConnections|SocketTimeout)$/.test(kind) ? kind : "unclassified",
    })
  }
  if (databaseReady) {
    try { schemaReady = await databaseSchemaReady() } catch { schemaReady = false }
  }

  const configurationReady = configurationIssues.length === 0
  const ready = databaseReady && schemaReady && configurationReady

  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      components: {
        database: databaseReady ? "ok" : "error",
        schema: schemaReady ? "ok" : "error",
        configuration: configurationReady ? "ok" : "error",
      },
    },
    { status: ready ? 200 : 503, headers: /^[a-f0-9]{40}$/.test(revision) ? { ...headers, "X-Freelio-Revision": revision } : headers },
  )
}
