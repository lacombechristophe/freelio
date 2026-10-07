"use client"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Rocket } from "lucide-react"
import { toast } from "sonner"
import { controlMarketingCampaignActivation, getMarketingCampaignAudienceReport, getMarketingCampaignAudienceHistory, verifyMarketingCampaignAudience } from "@/actions/campaigns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/shared/confirm-provider"
import { CampaignChoiceSelect } from "./campaign-management"

type Campaign = NonNullable<Awaited<ReturnType<typeof import("@/actions/campaigns").getCampaignDashboard>>>["campaigns"][number]
const labels: Record<string, string> = {
  READY: "Audience vérifiée", ENROLLING: "Inscription en cours", PAUSED: "Inscription en pause", COMPLETED: "Inscription terminée", CLOSED: "Inscription restante close",
  ELIGIBLE: "Éligible", EXCLUDED: "Exclu", PENDING: "À traiter", CREATED: "Inscrit", EXISTING: "Déjà inscrit", REJECTED: "Refusé à l’inscription",
  PROSPECT_INDISPONIBLE: "Prospect indisponible", ADRESSE_INVALIDE: "Adresse invalide", ADRESSE_BLOQUEE: "Adresse bloquée", CONSENTEMENT_RETIRE: "Consentement retiré",
  PREUVE_ADRESSE_ABSENTE: "Preuve liée à l’adresse absente", PREUVE_ADRESSE_INVALIDE: "Preuve liée à l’adresse invalide ou retirée", DEJA_INSCRIT: "Déjà inscrit",
  ADRESSE_OU_CONTACT_MODIFIE: "Adresse ou contact modifié", DROITS_RETIRES: "Droits d’activation retirés", CAMPAGNE_OU_SEQUENCE_ARRETEE: "Campagne ou séquence arrêtée",
  CONFIGURATION_MODIFIEE: "Configuration modifiée : rétablissez la configuration vérifiée ou clôturez l’inscription restante avant une nouvelle vérification", EXPEDITEUR_INDISPONIBLE: "Boîte expéditrice indisponible",
  LOT_INTERROMPU: "Lot interrompu : reprise disponible sans recommencer les inscriptions", CAPTURE_INCOMPLETE: "Capture incomplète : contrôle administrateur requis",
}

export function CampaignActivation({ campaign }: { campaign: Campaign }) {
  const [report, setReport] = useState<Awaited<ReturnType<typeof getMarketingCampaignAudienceReport>> | null>(null)
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [audienceId, setAudienceId] = useState<string | undefined>(), [reason, setReason] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false), [historyPage, setHistoryPage] = useState(1)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getMarketingCampaignAudienceHistory>> | null>(null), [historyError, setHistoryError] = useState("")
  const [pending, startTransition] = useTransition(), confirm = useConfirm(), router = useRouter()
  useEffect(() => {
    let active = true
    startTransition(async () => { try {
      const result = await getMarketingCampaignAudienceReport({ campaignId: campaign.id, audienceId, page, search })
      if (active) { setReport(result); setLoadError("") }
    } catch { if (active) setLoadError("Impossible de charger le rapport d’audience") } })
    return () => { active = false }
  }, [campaign.id, campaign.updatedAt, audienceId, page, search, attempt])
  useEffect(() => {
    if (!historyOpen) return
    let active = true
    startTransition(async () => { try {
      const result = await getMarketingCampaignAudienceHistory({ campaignId: campaign.id, page: historyPage })
      if (active) { setHistory(result); setHistoryError("") }
    } catch { if (active) setHistoryError("Impossible de charger les captures antérieures") } })
    return () => { active = false }
  }, [campaign.id, campaign.updatedAt, historyOpen, historyPage, attempt])
  useEffect(() => {
    if (report?.audience.status !== "ENROLLING") return
    const timer = window.setInterval(() => { if (!document.hidden) setAttempt(value => value + 1) }, 5_000)
    return () => window.clearInterval(timer)
  }, [report?.audience.status])
  const refreshed = () => { setAttempt(value => value + 1); router.refresh() }
  const control = async (operation: "START" | "PAUSE" | "RESUME" | "CLOSE") => {
    if (!report) return
    if (operation === "START" && !await confirm({ title: `Inscrire l’audience vérifiée de « ${campaign.name} » ?`, description: `${report.audience.eligible} prospect(s) étaient éligibles lors de la vérification. Leurs retraits, preuves et adresses seront relus avant inscription et envoi. Aucun nouveau membre du segment ne sera ajouté à cette capture.`, confirmLabel: "Inscrire l’audience vérifiée" })) return
    if (operation === "CLOSE" && (reason.trim().length < 3 || !await confirm({ title: "Clore l’inscription restante ?", description: `Motif : ${reason.trim()}. Les futurs lots de cette capture seront bloqués. Ses rapports et les inscriptions déjà créées seront conservés. Aucun envoi accepté ne sera annulé.`, confirmLabel: "Clore l’inscription restante" }))) return
    startTransition(async () => { try {
      const result = await controlMarketingCampaignActivation({ audienceId: report.audience.id, version: report.audience.version, operation, ...(operation === "CLOSE" ? { reason: reason.trim(), confirmed: true } : {}) })
      if (!result?.success) throw new Error(result?.error || "Activation impossible")
      setError(""); setReason(""); toast.success(operation === "CLOSE" ? "Inscription restante close ; historique conservé." : operation === "PAUSE" ? "Activation mise en pause." : "Activation enregistrée ; le processeur poursuit les lots."); refreshed()
    } catch (error) { setError(error instanceof Error ? error.message : "Activation impossible") } })
  }
  return <div className="mt-4 space-y-3 rounded-[10px] border bg-muted/25 p-3">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Rocket className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Activer l’audience</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Vérifiez une audience complète et figée, puis inscrivez-la par lots. La prospection exige une preuve de consentement liée à l’adresse exacte.</p></div></div>
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget)
      startTransition(async () => { try {
        const result = await verifyMarketingCampaignAudience({ campaignId: campaign.id, version: campaign.version, sequenceId: data.get("launchSequenceId") })
        if (!result?.success) throw new Error(result?.error || "Vérification impossible")
        if ("audienceId" in result && typeof result.audienceId === "string") setAudienceId(result.audienceId)
        setPage(1); setSearch(""); setReason(""); setHistoryPage(1); setError(""); toast.success("Audience vérifiée sans inscription."); refreshed()
      } catch (error) { setError(error instanceof Error ? error.message : "Vérification impossible") } })
    }}><CampaignChoiceSelect kind="SEQUENCE" name="launchSequenceId" label={`Séquence de diffusion pour ${campaign.name}`} campaignId={campaign.id} attachedOnly defaultValue={campaign.sequences.find(sequence => sequence.status === "ACTIVE")?.id} defaultLabel={campaign.sequences.find(sequence => sequence.status === "ACTIVE")?.name} required disabled={pending} />
      <Button demoMutation type="submit" disabled={pending || !["PLANNED", "ACTIVE"].includes(campaign.status) || !!report?.activeAudienceId} className="shrink-0"><Rocket />Vérifier l’audience</Button>
    </form>
    <Button variant="outline" size="sm" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>Captures antérieures</Button>
    {historyOpen ? <div className="space-y-2">
      {historyError ? <p role="alert" className="text-xs">{historyError}</p> : null}
      <select aria-label={`Capture antérieure pour ${campaign.name}`} value={audienceId || report?.audience.id || ""} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm" disabled={pending} onChange={event => { setAudienceId(event.target.value || undefined); setPage(1); setSearch(""); setReason(""); setError("") }}>
        <option value="">Dernière capture</option>{report && !history?.rows.some(row => row.id === report.audience.id) ? <option value={report.audience.id}>Capture sélectionnée · {labels[report.audience.status]}</option> : null}
        {history?.rows.map(row => <option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString("fr-FR")} · {labels[row.status] || row.status} · {row.processed}/{row.total}</option>)}
      </select>
      {history ? <div className="flex flex-wrap items-center gap-2 text-xs"><Button size="sm" variant="outline" aria-label={`Page précédente : captures ${campaign.name}`} disabled={pending || history.page <= 1} onClick={() => setHistoryPage(history.page - 1)}>Page précédente</Button><span>{history.total} capture(s) · Page {history.page} sur {history.pageCount}</span><Button size="sm" variant="outline" aria-label={`Page suivante : captures ${campaign.name}`} disabled={pending || history.page >= history.pageCount} onClick={() => setHistoryPage(history.page + 1)}>Page suivante</Button></div> : null}
    </div> : null}
    {error || loadError ? <p role="alert" className="text-sm">{error || loadError}</p> : null}
    {report ? <div className="space-y-3" aria-label={`Rapport d’audience pour ${campaign.name}`}>
      <p role="status" className="text-sm">{labels[report.audience.status] || report.audience.status} · {report.audience.total} prospect(s) · {report.audience.eligible} éligible(s) · {report.audience.excluded} exclu(s)</p>
      <p className="text-xs">{report.audience.processed}/{report.audience.total} traité(s) · {report.audience.enrolled} inscrit(s) · {report.audience.existing} déjà inscrit(s) · {report.audience.rejected} refusé(s) après vérification</p>
      {report.audience.closedAt ? <p className="break-words text-xs">Clôture : {new Date(report.audience.closedAt).toLocaleString("fr-FR")} · {report.audience.closureReason}</p> : null}
      {report.audience.errorCode ? <p role="alert" className="text-xs">{labels[report.audience.errorCode] || "Activation à contrôler"}</p> : null}
      <div className="flex flex-wrap gap-2">{report.audience.status === "READY" ? <Button demoMutation disabled={pending} onClick={() => void control("START")}>Inscrire l’audience vérifiée</Button> : null}{report.audience.status === "ENROLLING" ? <Button demoMutation disabled={pending} variant="outline" onClick={() => void control("PAUSE")}>Mettre l’inscription en pause</Button> : null}{report.audience.status === "PAUSED" ? <Button demoMutation disabled={pending} variant="outline" onClick={() => void control("RESUME")}>Reprendre l’inscription</Button> : null}</div>
      {["READY", "ENROLLING", "PAUSED"].includes(report.audience.status) ? <div className="space-y-2"><label className="block space-y-1 text-xs">Motif de clôture<Input aria-label={`Motif de clôture pour ${campaign.name}`} value={reason} maxLength={500} disabled={pending} onChange={event => setReason(event.target.value)} /></label><Button demoMutation variant="outline" disabled={pending || reason.trim().length < 3} onClick={() => void control("CLOSE")}>Clore l’inscription restante</Button></div> : null}
      <Input aria-label={`Rechercher dans l’audience de ${campaign.name}`} maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
      <div className="divide-y rounded-lg border">{report.rows.map(row => <div key={row.id} className="space-y-1 p-3 text-xs"><p className="break-words font-medium">{row.name} · {row.recipientEmail || "Sans adresse"}</p><p>{labels[row.decision]} · {labels[row.result]}{row.reason || row.resultReason ? ` · ${labels[row.resultReason || row.reason || ""] || "Contrôle requis"}` : ""}</p></div>)}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs"><Button variant="outline" size="sm" aria-label={`Page précédente : audience ${campaign.name}`} disabled={pending || report.page <= 1} onClick={() => setPage(report.page - 1)}>Page précédente</Button><span>{report.total} résultat(s) · Page {report.page} sur {report.pageCount}</span><Button variant="outline" size="sm" aria-label={`Page suivante : audience ${campaign.name}`} disabled={pending || report.page >= report.pageCount} onClick={() => setPage(report.page + 1)}>Page suivante</Button></div>
    </div> : null}
  </div>
}
