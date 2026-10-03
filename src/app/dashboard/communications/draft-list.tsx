"use client"
import { useEffect, useState, useTransition } from "react"
import { deleteCommunicationDraft, getCommunicationDrafts } from "@/actions/communications"
import type { EmailDraftPage } from "@/lib/communications/drafts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useConfirm } from "@/components/shared/confirm-provider"
import { toast } from "sonner"

export function DraftList({ onOpen, onDeleted }: { onOpen: (id: string) => void; onDeleted: (id: string) => void }) {
  const [data, setData] = useState<EmailDraftPage | null>(null)
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [pending, startTransition] = useTransition()
  const confirm = useConfirm()
  useEffect(() => {
    let active = true
    startTransition(async () => {
      try { const next = await getCommunicationDrafts({ page }); if (active) setData(next) }
      catch (error) { if (active) toast.error(error instanceof Error ? error.message : "Lecture des brouillons impossible") }
    })
    return () => { active = false }
  }, [page, attempt])
  return <Card className="workspace-panel"><CardHeader><CardTitle className="text-base">Brouillons privés</CardTitle><p className="text-xs text-muted-foreground">Seul leur auteur peut les consulter.</p></CardHeader><CardContent className="space-y-4" aria-busy={pending}>
    <Button type="button" variant="outline" disabled={pending} onClick={() => setAttempt(value => value + 1)}>Actualiser</Button>
    {data?.drafts.map(draft => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><div><p className="text-sm font-medium">{draft.subject || "Sans objet"}</p><p className="text-xs text-muted-foreground">{new Date(draft.updatedAt).toLocaleString("fr-FR")}</p></div><div className="flex gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => onOpen(draft.id)}>Rouvrir</Button><Button demoMutation type="button" variant="outline" disabled={pending} onClick={async () => {
      if (!await confirm({ title: "Supprimer ce brouillon ?", description: "Cette suppression concerne uniquement votre brouillon.", confirmLabel: "Supprimer", destructive: true })) return
      startTransition(async () => { try {
        const result = await deleteCommunicationDraft({ id: draft.id, version: draft.version })
        if (!result.success) throw new Error(result.error)
        onDeleted(draft.id); setAttempt(value => value + 1)
        toast.success("Brouillon supprimé.")
      } catch (error) { toast.error(error instanceof Error ? error.message : "Suppression impossible") } })
    }}>Supprimer</Button></div></div>)}
    {data && !data.total ? <p className="text-sm text-muted-foreground">Aucun brouillon enregistré.</p> : null}
    {data ? <div className="space-y-2"><p className="text-xs text-muted-foreground">{data.total} brouillon(s) · Page {data.page} sur {data.pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><Button variant="outline" disabled={pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div></div> : null}
  </CardContent></Card>
}
