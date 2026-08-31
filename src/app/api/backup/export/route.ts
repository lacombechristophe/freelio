import { buildBackupPayload } from "@/lib/backup"
import { withRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function backupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `crm-backup-${stamp}.json`
}

export async function GET() {
  return withRouteAuth("company.manage", async ({ userId, companyId }) => {
    const payload = await buildBackupPayload(userId, companyId)
    const json = JSON.stringify(payload)
    const bytes = new TextEncoder().encode(json)
    const chunkSize = 64 * 1024
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          controller.enqueue(bytes.subarray(offset, offset + chunkSize))
        }
        controller.close()
      },
    })
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${backupFilename()}"`,
        "cache-control": "no-store",
      },
    })
  })
}
