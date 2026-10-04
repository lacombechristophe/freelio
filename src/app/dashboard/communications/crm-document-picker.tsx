"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import { getCommunicationCrmDocuments } from "@/actions/communications"
import type { EmailDraftDto } from "@/lib/communications/drafts"
import type { CrmEmailDocumentPage } from "@/lib/communications/crm-documents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Selection = { kind: "CLIENT_FILE" | "ISSUED_INVOICE"; sourceId: string; sourceHash: string; attachmentId: string }
export function CrmDocumentPicker({ draft, onClose, onAttach }: { draft: EmailDraftDto; onClose: () => void; onAttach: (selection: Selection) => Promise<void> }) {
  const [kind, setKind] = useState<Selection["kind"]>("CLIENT_FILE")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loadedQuery, setLoadedQuery] = useState("")
  const [data, setData] = useState<CrmEmailDocumentPage | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [adding, startAdding] = useTransition()
  const attachmentId = useRef<string | null>(null)
  const queryKey = JSON.stringify([draft.id, kind, search, page])
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const result = await getCommunicationCrmDocuments({ draftId: draft.id, kind, search, page })
        if (!active) return
        if (!result.success) throw new Error(result.error)
        setData(result.page); setLoadedQuery(queryKey); setError("")
      } catch (failure) {
        if (active) { setData(null); setLoadedQuery(queryKey); setError(failure instanceof Error ? failure.message : "Lecture des documents impossible") }
      }
    }), 250)
    return () => { active = false; clearTimeout(timer) }
  }, [draft.id, kind, search, page, queryKey])
  const document = data?.documents.find(item => item.id === selectedId)
  const busy = pending || adding || loadedQuery !== queryKey
  return <Dialog open onOpenChange={open => { if (!open && !adding) onClose() }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Joindre un document CRM</DialogTitle><DialogDescription>Documents du client destinataire. Une copie privée sera conservée avec ce brouillon ; les originaux restent inchangés.</DialogDescription></DialogHeader>
    <fieldset disabled={adding} className="space-y-4" aria-busy={busy}>
      <div className="space-y-1.5"><Label htmlFor="crm-document-source">Source du document</Label><select id="crm-document-source" value={kind} disabled={pending} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm" onChange={event => { setKind(event.target.value as Selection["kind"]); setSearch(""); setPage(1); setSelectedId(""); attachmentId.current = null }}><option value="CLIENT_FILE">Fichiers du client</option><option value="ISSUED_INVOICE" disabled={!data?.canReadInvoices}>Factures émises archivées</option></select></div>
      <div className="space-y-1.5"><Label htmlFor="crm-document-search">Rechercher un document</Label><Input id="crm-document-search" value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setPage(1); setSelectedId(""); attachmentId.current = null }} /></div>
      <div className="space-y-1.5"><Label htmlFor="crm-document-selection">Document CRM</Label><select id="crm-document-selection" value={selectedId} disabled={busy || !data || data.kind !== kind} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm" onChange={event => { setSelectedId(event.target.value); attachmentId.current = null }}><option value="">Sélectionner un document…</option>{data?.kind === kind ? data.documents.map(item => <option key={item.id} value={item.id}>{item.name}{item.size === null ? " · PDF archivé" : ` · ${(item.size / 1024).toFixed(1)} Ko`}</option>) : null}</select></div>
      {data && data.kind === kind ? <div className="space-y-2"><p className="text-xs text-muted-foreground">{data.total} document(s) · Page {data.page} sur {data.pageCount}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || data.page <= 1} onClick={() => { setPage(data.page - 1); setSelectedId(""); attachmentId.current = null }}>Page précédente</Button><Button type="button" variant="outline" disabled={busy || data.page >= data.pageCount} onClick={() => { setPage(data.page + 1); setSelectedId(""); attachmentId.current = null }}>Page suivante</Button></div></div> : null}
      <p className="text-xs text-muted-foreground" role="status">{error || (busy ? "Chargement en cours" : "PDF, PNG ou JPEG · 5 Mo par fichier · 10 Mo au total · 5 pièces maximum")}</p>
    </fieldset>
    <DialogFooter><Button type="button" variant="outline" disabled={adding} onClick={onClose}>Annuler</Button><Button demoMutation type="button" disabled={busy || !document || data?.kind !== kind} onClick={() => startAdding(async () => {
      try {
        attachmentId.current ||= crypto.randomUUID()
        await onAttach({ kind, sourceId: document!.id, sourceHash: document!.sourceHash, attachmentId: attachmentId.current })
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Ajout impossible ; rouvrez le brouillon") }
    })}>Ajouter au brouillon</Button></DialogFooter>
  </DialogContent></Dialog>
}
