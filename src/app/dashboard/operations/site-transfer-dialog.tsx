"use client"

import { useState, useTransition } from "react"
import { moveSiteAgency } from "@/actions/asset-commands"
import { AssetChoice, useAssetChoices } from "@/components/shared/asset-choice"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { SiteEditorRecord } from "./asset-editors"

export function SiteTransferDialog({ site, onClose, onSaved }: { site: SiteEditorRecord; onClose: () => void; onSaved: () => void }) {
  const [agencyId, setAgencyId] = useState("")
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const choices = useAssetChoices("agency", agencyId, { siteId: site.id })
  const blocked = pending || !choices.ready || !confirmed || reason.trim().length < 5
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) return
    startTransition(async () => {
      try {
        const result = await moveSiteAgency({ siteId: site.id, agencyId, reason, confirmed, expectedUpdatedAt: site.updatedAt })
        if (!result.success) { setError(result.error); return }
        onSaved(); onClose()
      } catch { setError("Le transfert a échoué. Votre saisie est conservée.") }
    })
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Transférer le dossier du site</DialogTitle><DialogDescription>{site.client.name} · {site.label}. Agence actuelle : {site.agency?.name ?? "Sans agence"}.</DialogDescription></DialogHeader>
    <form onSubmit={save} aria-busy={pending} className="space-y-4">
      <p className="text-sm text-muted-foreground">Le site, ses équipements, ses chantiers et leurs historiques suivront l’agence destinataire. L’ancienne agence perdra cet accès ; les droits métier de chaque membre resteront appliqués. Les archives de documents et le stock physique seront conservés.</p>
      <div className="space-y-1.5"><Label htmlFor="transfer-agency">Agence destinataire</Label><AssetChoice choices={choices} name="transfer-agency" required disabled={pending} onChange={setAgencyId} /></div>
      <div className="space-y-1.5"><Label htmlFor="transfer-reason">Motif du transfert</Label><Textarea id="transfer-reason" value={reason} minLength={5} maxLength={2_000} required disabled={pending} onChange={event => setReason(event.target.value)} /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={pending} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />Je confirme le transfert de l’ensemble du dossier et le changement des accès d’agence.</label>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <DialogFooter><Button variant="outline" type="button" disabled={pending} onClick={onClose}>Annuler</Button><Button demoMutation type="submit" disabled={blocked}>{pending ? "Transfert…" : "Transférer le dossier"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
