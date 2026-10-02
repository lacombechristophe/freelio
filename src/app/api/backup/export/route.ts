import { buildBackupPayload } from "@/lib/backup"
import { withRouteAuth } from "@/lib/route-auth"
import { jsonResponseStream } from "@/lib/json-stream"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function backupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `crm-backup-${stamp}.json`
}

export async function GET() {
  return withRouteAuth("company.manage", async ({ userId, companyId }) => {
    const payload = await buildBackupPayload(userId, companyId)
    const body = jsonResponseStream(payload)
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${backupFilename()}"`,
        "cache-control": "no-store",
      },
    })
  })
}
