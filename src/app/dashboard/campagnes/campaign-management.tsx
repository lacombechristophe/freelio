"use client"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getCampaignAssets, getCampaignChoices, getCampaignSequences, updateMarketingCampaign, updateMarketingCampaignAsset, updateMarketingCampaignAssetStatus } from "@/actions/campaigns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Campaign = NonNullable<Awaited<ReturnType<typeof import("@/actions/campaigns").getCampaignDashboard>>>["campaigns"][number]
type Asset = Campaign["assets"][number]
const control = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm"
const channelNames: Record<string, string> = { EMAIL: "E-mail", SMS: "SMS", FORM: "Formulaire", SOCIAL: "Réseaux sociaux", ADS: "Publicité", EVENT: "Événement", CONTENT: "Contenu", DOCUMENT: "Document", OTHER: "Autre" }
const dateValue = (value: string | null) => value?.slice(0, 10) || ""
const preserveDate = (value: FormDataEntryValue | null, original: string | null) => value === dateValue(original) ? original : value

export function CampaignChoiceSelect({ kind, name, label, defaultValue = "", defaultLabel, campaignId, disabled, required, attachedOnly = false }: {
  kind: "SEGMENT" | "MEMBER" | "SEQUENCE"; name: string; label: string; defaultValue?: string; defaultLabel?: string; campaignId?: string; disabled?: boolean; required?: boolean; attachedOnly?: boolean
}) {
  const id = useId(), select = useRef<HTMLSelectElement>(null)
  const [selected, setSelected] = useState(defaultValue), [search, setSearch] = useState(""), [page, setPage] = useState(1)
  const [data, setData] = useState<Awaited<ReturnType<typeof getCampaignChoices>> | null>(null), [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let active = true
    startTransition(async () => { try {
      const result = await getCampaignChoices({ kind, page, search, campaignId, selectedId: selected || undefined, attachedOnly })
      if (active) { setData(result); setError("") }
    } catch { if (active) setError("Impossible de charger les choix") } })
    return () => { active = false }
  }, [kind, page, search, campaignId, selected, attachedOnly])
  useEffect(() => {
    const form = select.current?.form, reset = () => { setSelected(defaultValue); setSearch(""); setPage(1) }
    form?.addEventListener("reset", reset)
    return () => form?.removeEventListener("reset", reset)
  }, [defaultValue])
  const choices = data?.items || [], retained = data?.selected || (selected ? { id: selected, label: defaultLabel || "Sélection conservée" } : null)
  return <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor={id}>{label}</Label><Input aria-label={`Rechercher : ${label}`} value={search} disabled={disabled} onChange={event => { setSearch(event.target.value); setPage(1) }} maxLength={200} />
    <select ref={select} id={id} name={name} aria-label={label} value={selected} disabled={disabled} required={required} className={control} onChange={event => setSelected(event.target.value)}>
      <option value="">Choisir…</option>{retained && !choices.some(choice => choice.id === retained.id) ? <option value={retained.id}>{retained.label}</option> : null}{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </select>{error ? <p role="alert" className="text-xs">{error}</p> : null}{data ? <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" variant="outline" size="sm" aria-label={`Page précédente : ${label}`} disabled={disabled || pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><span>Page {data.page} sur {data.pageCount}</span><Button type="button" variant="outline" size="sm" aria-label={`Page suivante : ${label}`} disabled={disabled || pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div> : null}</div>
}

export function CampaignSequences({ campaign }: { campaign: Campaign }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCampaignSequences>> | null>(null), [search, setSearch] = useState(""), [page, setPage] = useState(1), [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let active = true
    startTransition(async () => { try { const result = await getCampaignSequences({ campaignId: campaign.id, page, search }); if (active) { setData(result); setError("") } } catch { if (active) setError("Impossible de charger les séquences") } })
    return () => { active = false }
  }, [campaign.id, campaign.updatedAt, page, search])
  return <div className="mt-3 space-y-2"><Input aria-label={`Rechercher une séquence pour ${campaign.name}`} value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setPage(1) }} />{error ? <p role="alert">{error}</p> : null}{(data?.items || campaign.sequences).map(sequence => <div key={sequence.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="break-words text-sm font-medium">{sequence.name}</p><Badge variant="outline">{sequence.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{sequence._count.enrollments} inscription(s) · {sequence._count.deliveries} envoi(s)</p></div>)}
    {data ? <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" size="sm" variant="outline" aria-label={`Page précédente : séquences ${campaign.name}`} disabled={pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><span>{data.total} séquence(s) · Page {data.page} sur {data.pageCount}</span><Button type="button" size="sm" variant="outline" aria-label={`Page suivante : séquences ${campaign.name}`} disabled={pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div> : null}
  </div>
}

export function CampaignEditor({ campaign: current }: { campaign: Campaign }) {
  const [editing, setEditing] = useState<Campaign | null>(null), [notice, setNotice] = useState("")
  const campaign = editing || current, open = editing !== null
  const [pending, startTransition] = useTransition(), router = useRouter()
  return <div className="space-y-3"><Button type="button" variant="outline" disabled={["COMPLETED", "ARCHIVED"].includes(campaign.status)} onClick={() => setEditing(editing ? null : current)}>Modifier</Button>{open ? <form key={campaign.version} className="grid gap-4 lg:grid-cols-3" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    startTransition(async () => { try {
      const result = await updateMarketingCampaign({ id: campaign.id, version: campaign.version, name: form.get("name"), objective: form.get("objective"), channels: form.getAll("channels"),
        segmentId: campaign.audienceLocked ? campaign.segmentId || "" : form.get("segmentId"), ownerMembershipId: form.get("ownerMembershipId"), startAt: preserveDate(form.get("startAt"), campaign.startAt), endAt: preserveDate(form.get("endAt"), campaign.endAt),
        budgetCents: Math.round(Number(form.get("budget") || 0) * 100), utmCampaign: form.get("utmCampaign"), notes: form.get("notes") })
      if (!result?.success) throw new Error(result?.error || "Modification impossible")
      toast.success("Campagne mise à jour."); setEditing(null); setNotice(""); router.refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : "Modification impossible") } })
  }}>
    <label className="space-y-1.5">Nom<Input name="name" required maxLength={140} defaultValue={campaign.name} /></label><label className="space-y-1.5">Objectif<Input name="objective" required maxLength={180} defaultValue={campaign.objective} /></label>
    <CampaignChoiceSelect kind="SEGMENT" label="Audience" name="segmentId" defaultValue={campaign.segmentId || ""} defaultLabel={campaign.segment?.name} disabled={campaign.audienceLocked || pending} />
    <CampaignChoiceSelect kind="MEMBER" label="Responsable" name="ownerMembershipId" defaultValue={campaign.ownerMembershipId || ""} defaultLabel={campaign.ownerMembership?.user.name || campaign.ownerMembership?.user.email || undefined} disabled={pending} />
    <label className="space-y-1.5">Début<Input name="startAt" type="date" defaultValue={dateValue(campaign.startAt)} /></label><label className="space-y-1.5">Fin<Input name="endAt" type="date" defaultValue={dateValue(campaign.endAt)} /></label>
    <label className="space-y-1.5">Budget (€)<Input name="budget" type="number" min="0" max="10000000" step="0.01" defaultValue={campaign.budgetCents / 100} /></label><label className="space-y-1.5">UTM campagne<Input name="utmCampaign" maxLength={120} defaultValue={campaign.utmCampaign || ""} /></label><label className="space-y-1.5">Notes<Textarea name="notes" maxLength={2000} defaultValue={campaign.notes || ""} /></label>
    <fieldset className="space-y-2 lg:col-span-3"><legend>Canaux</legend><div className="flex flex-wrap gap-4">{Object.entries(channelNames).filter(([key]) => !["DOCUMENT", "OTHER"].includes(key)).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" name="channels" value={key} defaultChecked={campaign.channels.includes(key)} />{label}</label>)}</div></fieldset>
    {campaign.audienceLocked ? <p className="text-xs lg:col-span-3">Audience et rattachements verrouillés après inscription.</p> : null}{notice ? <p role="status" className="text-sm lg:col-span-3">{notice}</p> : null}<div className="flex gap-2 lg:col-span-3"><Button demoMutation type="submit" disabled={pending}>Enregistrer</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setNotice("") }}>Annuler</Button></div>
  </form> : null}</div>
}

function AssetEditor({ asset: current, onSaved, disabled }: { asset: Asset; onSaved: () => void; disabled: boolean }) {
  const [editing, setEditing] = useState<Asset | null>(null), [notice, setNotice] = useState("")
  const asset = editing || current, open = editing !== null
  const [pending, startTransition] = useTransition()
  return <div className="space-y-3"><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(editing ? null : current)}>Modifier</Button>{open ? <form key={asset.version} className="grid gap-3 sm:grid-cols-2" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    startTransition(async () => { try {
      const result = await updateMarketingCampaignAsset({ id: asset.id, version: asset.version, name: form.get("name"), type: form.get("type"), ownerMembershipId: form.get("ownerMembershipId"), dueAt: preserveDate(form.get("dueAt"), asset.dueAt), url: form.get("url") })
      if (!result?.success) throw new Error(result?.error || "Modification impossible")
      setEditing(null); setNotice(""); toast.success("Livrable mis à jour."); onSaved()
    } catch (error) { setNotice(error instanceof Error ? error.message : "Modification impossible") } })
  }}><label>Nom<Input name="name" required maxLength={160} defaultValue={asset.name} /></label><label>Type<select name="type" className={control} defaultValue={asset.type}>{Object.entries(channelNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <CampaignChoiceSelect kind="MEMBER" name="ownerMembershipId" label="Responsable du livrable" defaultValue={asset.ownerMembershipId || ""} disabled={pending} /><label>Échéance<Input name="dueAt" type="date" defaultValue={dateValue(asset.dueAt)} /></label><label className="sm:col-span-2">URL<Input name="url" type="url" defaultValue={asset.url || ""} /></label>{notice ? <p role="status" className="sm:col-span-2">{notice}</p> : null}<div className="flex gap-2 sm:col-span-2"><Button demoMutation type="submit" disabled={pending}>Enregistrer</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setNotice("") }}>Annuler</Button></div></form> : null}</div>
}

export function CampaignAssets({ campaign }: { campaign: Campaign }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCampaignAssets>> | null>(null), [search, setSearch] = useState(""), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [error, setError] = useState("")
  const [pending, startTransition] = useTransition(), router = useRouter()
  const closed = ["COMPLETED", "ARCHIVED"].includes(campaign.status)
  const refresh = () => { setAttempt(value => value + 1); router.refresh() }
  useEffect(() => {
    let active = true
    startTransition(async () => { try { const result = await getCampaignAssets({ campaignId: campaign.id, page, search }); if (active) { setData(result); setError("") } } catch { if (active) setError("Impossible de charger les livrables") } })
    return () => { active = false }
  }, [campaign.id, campaign.updatedAt, page, search, attempt])
  return <div className="mt-3 space-y-3"><Input aria-label={`Rechercher un livrable pour ${campaign.name}`} value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setPage(1) }} />{error ? <p role="alert">{error}</p> : null}<div className="divide-y rounded-lg border">{(data?.items || campaign.assets).map(asset => <div key={asset.id} className="space-y-3 p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{asset.name}</p><p className="text-xs text-muted-foreground">{channelNames[asset.type] || asset.type}{asset.dueAt ? ` · échéance ${new Date(asset.dueAt).toLocaleDateString("fr-FR")}` : ""}</p></div>
    <select aria-label={`Statut de ${asset.name}`} value={asset.status} disabled={pending || closed} className="h-9 rounded-lg border bg-background px-2 text-xs" onChange={event => {
      const status = event.target.value
      startTransition(async () => { try { const result = await updateMarketingCampaignAssetStatus(asset.id, status, asset.version); if (!result.success) throw new Error(result.error); refresh() } catch (error) { setError(error instanceof Error ? error.message : "Modification impossible") } })
    }}><option value="TODO">À faire</option><option value="IN_PROGRESS">En cours</option><option value="READY">Prêt</option><option value="PUBLISHED">Publié</option><option value="CANCELLED">Annulé</option></select></div><AssetEditor asset={asset} onSaved={refresh} disabled={closed || pending} /></div>)}</div>
    {data ? <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" variant="outline" size="sm" aria-label={`Page précédente : livrables ${campaign.name}`} disabled={pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><span>{data.total} livrable(s) · Page {data.page} sur {data.pageCount}</span><Button type="button" variant="outline" size="sm" aria-label={`Page suivante : livrables ${campaign.name}`} disabled={pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div> : null}
  </div>
}

