"use client"

import { useTransition } from "react"
import { CalendarClock, FileSignature, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { renewMaintenanceContract, updateMaintenanceRenewalSettings } from "@/actions/operations"
import { createMaintenanceRenewalProposal } from "@/actions/contrats"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { indexedMaintenancePrice, maintenanceRenewalWindow } from "@/lib/operations/maintenance-renewal"

type OperationsData = Awaited<ReturnType<typeof import("@/actions/operations").getOperationsDashboard>>
type Contract = OperationsData["contracts"][number]

const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const statusLabels: Record<string, string> = { NOT_DUE: "Non préparé", UPCOMING: "À préparer", PROPOSED: "Proposé", ACCEPTED: "Accepté", DECLINED: "Refusé", RENEWED: "Renouvelé" }

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function date(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "Non définie"
}

export function MaintenanceRenewalPanel({ contract }: { contract: Contract }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const window = maintenanceRenewalWindow(contract.endDate, contract.noticeDays)
  const nextPrice = indexedMaintenancePrice(contract.priceCents, contract.indexationRate)
  const renewed = contract.renewalStatus === "RENEWED" || contract._count.renewedContracts > 0
  const proposal = contract.renewalProposals[0]
  const canRenew = Boolean(contract.endDate && (contract.renewalStatus === "ACCEPTED" || contract.autoRenew) && contract.renewalStatus !== "DECLINED")

  function run(task: () => Promise<unknown>, success: string) {
    startTransition(() => void task().then(() => { toast.success(success); router.refresh() }).catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))
  }

  function openProposal() {
    if (proposal) return router.push(`/dashboard/contrats/${proposal.id}`)
    startTransition(() => void createMaintenanceRenewalProposal(contract.id)
      .then((created) => router.push(`/dashboard/contrats/${created.id}`))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Proposition impossible.")))
  }

  return <details className="group">
    <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><code className="text-xs font-semibold">{contract.number}</code><Badge variant="outline">{contract.status}</Badge><Badge variant={contract.renewalStatus === "DECLINED" ? "destructive" : renewed ? "secondary" : window.status === "OPEN" || window.status === "OVERDUE" ? "default" : "outline"}>{statusLabels[contract.renewalStatus] || contract.renewalStatus}</Badge>{contract.renewedFrom && <Badge variant="outline">Suite de {contract.renewedFrom.number}</Badge>}</div>
        <p className="mt-2 text-sm font-semibold">{contract.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{contract.client.name} · {contract.site.label} · {contract._count.equipments} équipement{contract._count.equipments > 1 ? "s" : ""}</p>
      </div>
      <div className="text-left sm:text-right"><p className="text-sm font-medium tabular-nums">{money(contract.priceCents)}</p><p className="text-xs text-muted-foreground">Fin : {date(contract.endDate)} · visite : {date(contract.nextVisitAt)}</p></div>
    </summary>
    <div className="border-t bg-muted/10 p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-3"><p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="size-3.5" />Fenêtre</p><p className="mt-2 text-sm font-semibold">{window.status === "NO_END" ? "Date de fin requise" : window.status === "OVERDUE" ? `Échu depuis ${Math.abs(window.daysRemaining || 0)} j` : `${window.daysRemaining} j restant(s)`}</p></div>
        <div className="rounded-lg border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Prochain tarif</p><p className="mt-2 text-sm font-semibold tabular-nums">{money(nextPrice)}</p><p className="mt-1 text-[11px] text-muted-foreground">Indexation {contract.indexationRate}%</p></div>
        <div className="rounded-lg border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Facturation</p><p className="mt-2 text-sm font-semibold">{contract.recurringInvoice?.isActive ? "Récurrente active" : "Manuelle"}</p><p className="mt-1 text-[11px] text-muted-foreground">{proposal ? `${proposal.number} · ${proposal.status}` : contract.autoRenew ? "Renouvellement automatique autorisé" : "Décision manuelle"}</p></div>
      </div>
      {renewed ? <div className="rounded-lg border border-success/20 bg-success/5 p-4 text-sm"><p className="flex items-center gap-2 font-semibold text-success"><ShieldCheck className="size-4" />Terme renouvelé</p><p className="mt-1 text-xs text-muted-foreground">{contract._count.renewedContracts} nouveau terme rattaché. L’ancien contrat reste figé pour l’historique.</p></div> : <form key={[contract.noticeDays, contract.indexationRate, contract.autoRenew, contract.renewalStatus, contract.renewalNotes].join("|")} className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateMaintenanceRenewalSettings({ contractId: contract.id, noticeDays: data.get("noticeDays"), indexationRate: data.get("indexationRate"), autoRenew: data.get("autoRenew") === "on", renewalStatus: data.get("renewalStatus"), renewalNotes: data.get("renewalNotes") }), "Paramètres de renouvellement enregistrés.") }}>
        <div><Label htmlFor={`notice-${contract.id}`}>Préavis (jours)</Label><Input id={`notice-${contract.id}`} name="noticeDays" type="number" min="0" max="365" defaultValue={contract.noticeDays} className="mt-1.5" /></div>
        <div><Label htmlFor={`indexation-${contract.id}`}>Indexation (%)</Label><Input id={`indexation-${contract.id}`} name="indexationRate" type="number" min="-100" max="100" step="0.01" defaultValue={contract.indexationRate} className="mt-1.5" /></div>
        <div><Label htmlFor={`renewal-status-${contract.id}`}>Décision</Label><select id={`renewal-status-${contract.id}`} name="renewalStatus" defaultValue={contract.renewalStatus} className={`${controlClass} mt-1.5`}><option value="NOT_DUE">Non préparé</option><option value="UPCOMING">À préparer</option><option value="PROPOSED">Proposé au client</option><option value="ACCEPTED">Accepté</option><option value="DECLINED">Refusé</option></select></div>
        <label className="flex items-center gap-3 self-end rounded-lg border bg-background px-3 py-2.5 text-sm"><input name="autoRenew" type="checkbox" defaultChecked={contract.autoRenew} className="size-4" />Autoriser le renouvellement automatique</label>
        <div className="lg:col-span-2"><Label htmlFor={`renewal-notes-${contract.id}`}>Notes de renouvellement</Label><Textarea id={`renewal-notes-${contract.id}`} name="renewalNotes" rows={3} maxLength={5_000} defaultValue={contract.renewalNotes || ""} className="mt-1.5" placeholder="Échanges, conditions proposées, objections ou accord client…" /></div>
        <div className="flex flex-wrap gap-2 lg:col-span-2"><Button type="submit" variant="outline" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Enregistrer le renouvellement</Button><Button type="button" variant="outline" disabled={pending || !contract.endDate || contract.renewalStatus === "DECLINED"} title={!contract.endDate ? "Renseignez une date de fin" : "Préparer le document à faire signer"} onClick={openProposal}>{pending ? <Loader2 className="animate-spin" /> : <FileSignature />}{proposal ? "Ouvrir la proposition" : "Créer la proposition"}</Button><Button type="button" disabled={pending || !canRenew} title={!contract.endDate ? "Renseignez une date de fin" : contract.renewalStatus === "DECLINED" ? "Le renouvellement est refusé" : !canRenew ? "Un accord client ou le renouvellement automatique est requis" : "Créer le nouveau terme"} onClick={() => run(() => renewMaintenanceContract(contract.id), "Contrat renouvelé et nouveau terme créé.")}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Créer le nouveau terme</Button></div>
      </form>}
    </div>
  </details>
}
