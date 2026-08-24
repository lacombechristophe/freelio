import { POST as withdrawConsent } from "@/app/api/public/consent/withdraw/route"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headers = new Headers(request.headers)
  headers.set("content-type", "application/json")
  headers.delete("content-length")
  return withdrawConsent(new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ token }),
  }))
}
