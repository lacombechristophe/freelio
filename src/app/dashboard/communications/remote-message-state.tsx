"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import type { remoteMailView } from "@/lib/communications/remote-mail-view"

export function RemoteMessageState({ messageId, state, disabled }: { messageId: string; state: ReturnType<typeof remoteMailView>; disabled: boolean }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState("")
  if (!state) return <p className="mt-2 text-xs text-muted-foreground">État fournisseur non observé.</p>
  const checkedAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(state.checkedAt))
  async function download(key: string, name: string) {
    setBusy(key); setError("")
    try {
      const response = await fetch(`/api/communications/messages/${messageId}/attachments/${key}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || "Téléchargement indisponible")
      }
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a")
      link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Téléchargement indisponible") }
    finally { setBusy(null) }
  }
  return <div className="mt-3 space-y-2 text-xs text-muted-foreground">
    <p>{state.presence === "MISSING" ? "Message absent chez le fournisseur — copie CRM conservée" : state.read === true ? "Lu chez le fournisseur" : state.read === false ? "Non lu chez le fournisseur" : "Lecture fournisseur inconnue"}
      {state.presence === "PRESENT" && state.folderNames.length ? ` · ${state.folderNames.join(", ")}` : ""} · Observé le {checkedAt} UTC</p>
    {!!state.attachments.length && <><p>Pièces chez le fournisseur — aucune archive locale durable.</p><ul className="space-y-1">{state.attachments.map(file => <li key={file.key} className="flex flex-wrap items-center gap-2">
      <span>{file.name} · {(file.size / 1024).toFixed(1)} Ko</span>
      {file.refusal || disabled || state.presence === "MISSING" ? <span>{file.refusal || (disabled ? "Lecture fournisseur désactivée dans la démo" : "Pièce distante indisponible")}</span>
        : <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void download(file.key, file.name)}>{busy === file.key ? "Téléchargement…" : "Télécharger"}</Button>}
    </li>)}</ul></>}
    {!state.attachmentsComplete && <p>Métadonnées des pièces incomplètes ; synchronisation à poursuivre.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>
}
