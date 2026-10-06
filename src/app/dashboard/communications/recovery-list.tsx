"use client"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { getCommunicationRecovery, checkCommunicationResult, repairCommunicationHistory, closeCommunicationWithoutRetry } from "@/actions/communications"
import type { ManualEmailRecoveryPage } from "@/lib/communications/manual-recovery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/shared/confirm-provider"

const states: Record<string, string> = { ACCEPTED: "Acceptation confirmée — livraison non garantie", UNKNOWN: "Résultat inconnu", DRAFT: "Brouillon distant retrouvé — résultat d’envoi inconnu", UNAVAILABLE: "Vérification indisponible — résultat inconnu" }
export function RecoveryList({ onChange }: { onChange: () => Promise<void> }) {
  const [data, setData] = useState<ManualEmailRecoveryPage | null>(null)
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState("")
  const [pending, startTransition] = useTransition()
  const confirm = useConfirm()
  useEffect(() => {
    let active = true
    startTransition(async () => {
      try {
        const result = await getCommunicationRecovery({ page })
        if (!result.success) throw new Error(result.error)
        if (active) setData(result.page)
      } catch (error) { if (active) setNotice(error instanceof Error ? error.message : "Lecture impossible") }
    })
    return () => { active = false }
  }, [page, attempt])
  const act = (row: ManualEmailRecoveryPage["deliveries"][number], operation: "CHECK" | "REPAIR" | "CLOSE") => startTransition(async () => {
    try {
      const identity = { id: row.id, version: row.version }
      const result = operation === "CHECK" ? await checkCommunicationResult(identity) : operation === "REPAIR" ? await repairCommunicationHistory(identity) : await closeCommunicationWithoutRetry({ ...identity, reason: reasons[row.id], confirmed: true })
      if (!result.success) throw new Error(result.error)
      const message = operation === "CLOSE" ? "Commande classée sans relance ; original conservé, résultat distant inchangé." : operation === "REPAIR" ? "Historique réparé sans nouvel envoi." : states[result.outcome] || "Résultat inconnu"
      setNotice(message); toast.success(message); setAttempt(value => value + 1); await onChange()
    } catch (error) { setNotice(error instanceof Error ? error.message : "Décision impossible") }
  })
  return <Card className="workspace-panel"><CardHeader><CardTitle className="text-base">Envois à vérifier</CardTitle><p className="text-xs text-muted-foreground">Vos commandes manuelles. La vérification ne renvoie aucun e-mail ; un résultat absent reste inconnu.</p></CardHeader><CardContent className="space-y-4" aria-busy={pending}>
    <Button type="button" variant="outline" disabled={pending} onClick={() => setAttempt(value => value + 1)}>Actualiser</Button>
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    {data?.deliveries.map(row => <div key={row.id} className="space-y-3 border-b py-3"><div><p className="break-words text-sm font-medium">{row.subject || "Sans objet"}</p><p className="break-words text-xs text-muted-foreground">{row.mailbox} · {new Date(row.createdAt).toLocaleString("fr-FR")}</p><p className="text-sm">{states[row.state] || states.UNKNOWN}</p>{row.checkedAt ? <p className="text-xs text-muted-foreground">Dernier contrôle : {new Date(row.checkedAt).toLocaleString("fr-FR")}</p> : null}</div><div className="flex flex-wrap gap-2">
      <Button demoMutation type="button" variant="outline" disabled={pending} onClick={() => act(row, "CHECK")}>Vérifier le résultat</Button>
      <Button demoMutation type="button" variant="outline" disabled={pending || !row.canRepair} onClick={() => act(row, "REPAIR")}>Réparer l’historique</Button>
    </div>{!row.canRepair ? <div className="space-y-2"><Label htmlFor={`reason-${row.id}`}>Motif du classement</Label><Input id={`reason-${row.id}`} maxLength={500} value={reasons[row.id] || ""} onChange={event => setReasons(value => ({ ...value, [row.id]: event.target.value }))} /><Button demoMutation type="button" variant="outline" disabled={pending || (reasons[row.id]?.trim().length || 0) < 3} onClick={async () => {
      if (await confirm({ title: "Classer cette commande sans relance ?", description: "Le brouillon et la trace seront conservés. Toute relance de cette commande sera bloquée ; un résultat inconnu ne prouve pas une absence d’envoi.", confirmLabel: "Classer sans relance", destructive: true })) act(row, "CLOSE")
    }}>Classer sans relance</Button></div> : null}</div>)}
    {data && !data.total ? <p className="text-sm text-muted-foreground">Aucun envoi personnel à vérifier.</p> : null}
    {data ? <div className="space-y-2"><p className="text-xs text-muted-foreground">{data.total} commande(s) · Page {data.page} sur {data.pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><Button variant="outline" disabled={pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div></div> : null}
  </CardContent></Card>
}
