"use client"

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_LOCAL_FILE_BYTES = 3.5 * 1024 * 1024

export type ResourceFileKind = "client" | "expense" | "project" | "intervention"

type ApiError = { error?: string }
type PresignResponse = ApiError & {
  direct?: boolean
  upload?: { uploadUrl: string; storageKey: string; headers: Record<string, string> }
}

async function responsePayload<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function uploadResourceFile(kind: ResourceFileKind, resourceId: string, file: File) {
  if (file.size <= 0) throw new Error("Le fichier est vide")
  if (file.size > MAX_FILE_BYTES) throw new Error("Le fichier dépasse 15 Mo")
  if (!file.type) throw new Error("Le type du fichier n’est pas reconnu")

  const endpoint = `/api/files/${kind}/${encodeURIComponent(resourceId)}`
  const metadata = { name: file.name, size: file.size, type: file.type, sha256: await fileSha256(file) }
  const presignResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "presign", file: metadata }),
  })
  const presign = await responsePayload<PresignResponse>(presignResponse)
  if (!presignResponse.ok) throw new Error(presign.error || "Préparation du transfert impossible")

  if (!presign.direct || !presign.upload) {
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      throw new Error("Le stockage R2 doit être configuré pour envoyer un fichier de plus de 3,5 Mo.")
    }
    const formData = new FormData()
    formData.set("file", file)
    const fallbackResponse = await fetch(endpoint, { method: "POST", body: formData })
    const fallback = await responsePayload<ApiError>(fallbackResponse)
    if (!fallbackResponse.ok) throw new Error(fallback.error || "Envoi du fichier impossible")
    return fallback
  }

  const { uploadUrl, storageKey, headers } = presign.upload
  try {
    const uploadResponse = await fetch(uploadUrl, { method: "PUT", headers, body: file })
    if (!uploadResponse.ok) throw new Error("Le stockage distant a refusé le fichier")

    const completionResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete", file: { ...metadata, storageKey } }),
    })
    const completion = await responsePayload<ApiError>(completionResponse)
    if (!completionResponse.ok) throw new Error(completion.error || "Validation du fichier impossible")
    return completion
  } catch (error) {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "abort", storageKey }),
    }).catch(() => {})
    throw error
  }
}
