import "server-only"

export class PayloadTooLargeError extends Error {
  constructor() {
    super("PAYLOAD_TOO_LARGE")
    this.name = "PayloadTooLargeError"
  }
}

function declaredLength(request: Request) {
  const value = request.headers.get("content-length")
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function readBodyBytes(request: Request, maxBytes: number) {
  const contentLength = declaredLength(request)
  if (contentLength !== null && contentLength > maxBytes) throw new PayloadTooLargeError()
  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new PayloadTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readTextBody(request: Request, maxBytes: number) {
  return new TextDecoder().decode(await readBodyBytes(request, maxBytes))
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readTextBody(request, maxBytes))
}
