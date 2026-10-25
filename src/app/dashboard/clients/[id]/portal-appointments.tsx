"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getClientPortalAppointments, getPortalBookingMemberChoices, savePortalAppointment } from "@/actions/portal-bookings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { appointmentLabels, type PortalAppointment } from "@/lib/scheduling/appointment"
import { bookingLocalInput, resolveBookingLocalTime } from "@/lib/scheduling/booking-time"

const format = (value: string, timeZone: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))
type Choices = NonNullable<Awaited<ReturnType<typeof getPortalBookingMemberChoices>>>
type BookingDraft = { status: string; response: string; member: string; start: string; revision: string; timeZone: string }

function AppointmentEditor({ record, clientId, timeZone, canManage, onSaved, draft: retainedDraft, onDraftChange }: {
  record: PortalAppointment; clientId: string; timeZone: string; canManage: boolean; onSaved: () => void
  draft?: BookingDraft; onDraftChange: (draft: BookingDraft) => void
}) {
  const initial = (row: PortalAppointment) => ({ status: row.status, response: row.response ?? "", member: row.assignedMembershipId ?? "",
    start: bookingLocalInput(row.scheduledStart ?? row.preferredStart, timeZone), revision: row.updatedAt, timeZone })
  const draft = retainedDraft ?? initial(record)
  const setDraft = onDraftChange
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [choices, setChoices] = React.useState<Choices | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  React.useEffect(() => {
    if (!canManage || draft.status !== "CONFIRMED") return
    let current = true
    setLoading(true)
    const timer = setTimeout(() => {
      void getPortalBookingMemberChoices({ clientId, search, page, ...(draft.member ? { selectedId: draft.member } : {}) }).then(result => {
        if (!current) return
        setChoices(result ?? null); setLoading(false)
      }).catch(() => { if (current) { setChoices(null); setLoading(false); setError("Liste des membres indisponible. Votre saisie est conservée.") } })
    }, 200)
    return () => { current = false; clearTimeout(timer) }
  }, [canManage, clientId, draft.member, draft.status, page, search])
  const options = choices ? [...choices.items, ...(choices.selected && !choices.items.some(row => row.id === choices.selected!.id) ? [choices.selected] : [])] : []
  const parsed = resolveBookingLocalTime(draft.start, draft.timeZone)
  const verified = !!draft.member && !!choices?.selected && choices.selected.id === draft.member && choices.timeZone === draft.timeZone && draft.timeZone === timeZone && !loading
  const reserved = record.scheduledStart && record.scheduledEnd
  return <article className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{record.subject}</p><Badge variant="secondary">{appointmentLabels[record.status] ?? record.status}</Badge></div>
    <p className="text-xs text-muted-foreground">Souhaité le {format(record.preferredStart, timeZone)} · {record.durationMinutes} min · {timeZone}</p>
    {record.alternativeStart && <p className="text-xs text-muted-foreground">Alternative : {format(record.alternativeStart, timeZone)}</p>}
    {reserved ? <p className="text-sm">{record.status === "CANCELLED" ? "Ancien créneau" : "Créneau réservé"} : {format(record.scheduledStart!, timeZone)} – {format(record.scheduledEnd!, timeZone)} · {record.member ?? "Membre historique indisponible"}</p>
      : ["CONFIRMED", "COMPLETED"].includes(record.status) && <p className="text-sm">Confirmation historique — aucun créneau réservé n’a été conservé.</p>}
    {record.notes && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{record.notes}</p>}
    {!canManage ? record.response && <p className="text-sm">Réponse : {record.response}</p> : <>
      <Label htmlFor={`booking-status-${record.id}`}>Statut</Label>
      <select id={`booking-status-${record.id}`} value={draft.status} disabled={pending} onChange={event => setDraft({ ...draft, status: event.target.value })} className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm">
        {Object.entries(appointmentLabels).map(([value, label]) => <option key={value} value={value}>{value === "CONFIRMED" ? "Confirmer / replanifier" : label}</option>)}
      </select>
      {draft.status === "CONFIRMED" && <div className="space-y-2">
        <Label htmlFor={`booking-search-${record.id}`}>Rechercher un membre de l’équipe</Label>
        <Input id={`booking-search-${record.id}`} value={search} maxLength={200} disabled={pending} onChange={event => { setSearch(event.target.value); setPage(1) }} />
        <Label htmlFor={`booking-member-${record.id}`}>Membre réservé</Label>
        <select id={`booking-member-${record.id}`} value={draft.member} disabled={pending} onChange={event => setDraft({ ...draft, member: event.target.value })} className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm">
          <option value="">Choisir un membre</option>
          {draft.member && !options.some(row => row.id === draft.member) && <option value={draft.member}>Choix à vérifier</option>}
          {options.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2 text-xs"><Button variant="outline" size="sm" disabled={loading || pending || page <= 1} onClick={() => setPage(page - 1)}>Page précédente</Button>
          <span>{choices ? `${choices.total} membres · page ${choices.page}` : "Chargement des membres…"}</span>
          <Button variant="outline" size="sm" disabled={loading || pending || !choices || choices.page * 25 >= choices.total} onClick={() => setPage(page + 1)}>Page suivante</Button></div>
        <Label htmlFor={`booking-start-${record.id}`}>Début ({draft.timeZone})</Label>
        <Input id={`booking-start-${record.id}`} type="datetime-local" value={draft.start} disabled={pending} onChange={event => setDraft({ ...draft, start: event.target.value })} />
        <p className="text-xs text-muted-foreground">{parsed.date ? `Fin : ${format(new Date(parsed.date.getTime() + record.durationMinutes * 60_000).toISOString(), draft.timeZone)}` : parsed.error}</p>
        <p className="text-xs text-muted-foreground">Le contrôle couvre les rendez-vous CRM et interventions de ce membre. Les autres tâches et calendriers externes ne sont pas vérifiés ; aucun événement distant n’est créé.</p>
      </div>}
      <Label htmlFor={`booking-response-${record.id}`}>Réponse au client</Label>
      <Input id={`booking-response-${record.id}`} value={draft.response} maxLength={1000} disabled={pending} onChange={event => setDraft({ ...draft, response: event.target.value })} />
      {(draft.revision !== record.updatedAt || draft.timeZone !== timeZone) && <p role="status" className="text-sm">La demande ou le fuseau a changé. Votre saisie est conservée. <Button variant="outline" size="sm" disabled={pending} onClick={() => { setDraft(initial(record)); setError("") }}>Recharger les valeurs enregistrées</Button></p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button demoMutation variant="outline" disabled={pending || draft.status === "CONFIRMED" && (!verified || !parsed.date)} onClick={() => {
        setError("")
        startTransition(async () => {
          try {
            const result = await savePortalAppointment({ id: record.id, status: draft.status, response: draft.response, expectedUpdatedAt: draft.revision,
              ...(draft.status === "CONFIRMED" ? { assignedMembershipId: draft.member, scheduledLocalStart: draft.start, timeZone: draft.timeZone } : {}) })
            if (!result.success) { setError(result.error); return }
            setDraft({ ...draft, revision: result.updatedAt }); toast.success("Demande mise à jour."); onSaved()
          } catch { setError("Enregistrement indisponible. Votre saisie est conservée. Actualisez les données avant de réessayer.") }
        })
      }}>Enregistrer</Button>
    </>}
  </article>
}

export function PortalAppointments({ clientId, timeZone, canManage }: { clientId: string; timeZone: string; canManage: boolean }) {
  const router = useRouter()
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getClientPortalAppointments>> | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, BookingDraft>>({})
  const [page, setPage] = React.useState(1)
  const [reload, setReload] = React.useState(0)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let current = true; setLoading(true)
    void getClientPortalAppointments({ clientId, page }).then(result => { if (current) { setData(result); setError(result ? "" : "Espace indisponible."); setLoading(false) } })
      .catch(() => { if (current) { setError("Demandes indisponibles. Les valeurs affichées sont conservées."); setLoading(false) } })
    return () => { current = false }
  }, [clientId, page, reload])
  return <div className="mt-3 space-y-3" aria-busy={loading}>
    {error && <p role="alert">{error}</p>}
    <Button variant="outline" size="sm" disabled={loading} onClick={() => setReload(reload + 1)}>Actualiser les demandes</Button>
    {data?.items.map(record => <AppointmentEditor key={record.id} record={record} clientId={clientId} timeZone={timeZone} canManage={canManage}
      draft={drafts[record.id]} onDraftChange={draft => setDrafts(current => ({ ...current, [record.id]: draft }))}
      onSaved={() => { setReload(value => value + 1); router.refresh() }} />)}
    {data?.total === 0 && <p className="text-sm text-muted-foreground">Aucune demande reçue.</p>}
    <div className="flex flex-wrap items-center gap-2 text-xs"><Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Page précédente</Button>
      <span>{data ? `${data.total} demandes · page ${data.page}` : "Chargement…"}</span>
      <Button variant="outline" size="sm" disabled={loading || !data || data.page * 25 >= data.total} onClick={() => setPage(page + 1)}>Page suivante</Button></div>
  </div>
}
