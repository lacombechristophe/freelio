import { buildBackupPayload } from "@/lib/backup"
import { getRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function backupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `crm-backup-${stamp}.json`
}

export async function GET() {
  const access = await getRouteAuth("company.manage")
  if (!access.ok) return access.response

  const payload = await buildBackupPayload(access.context.userId, access.context.companyId)
  const json = JSON.stringify(payload)
  return new Response(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${backupFilename()}"`,
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(json, "utf8").toString(),
    },
  })
}
