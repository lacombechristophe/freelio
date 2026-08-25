"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Check, Copy, KeyRound, MessageSquare, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"

import {
  createClientPortalAccess,
  revokeClientPortalAccess,
  sendTeamPortalMessage,
  updateClientPortalAppointment,
} from "@/actions/portal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Contact = { id: string; firstName: string; lastName: string; email: string | null }
type PortalAccess = {
  id: string
  label: string | null
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  contact: Contact | null
}
type PortalMessage = {
  id: string
  direction: string
  authorName: string
  body: string
  readAt: string | null
  createdAt: string
}
type Appointment = {
  id: string
  subject: string
  preferredStart: string
  alternativeStart: string | null
  durationMinutes: number
  notes: string | null
  status: string
  response: string | null
  createdAt: string
}

const appointmentLabels: Record<string, string> = {
  PENDING: "À traiter",
  CONFIRMED: "Confirmé",
  DECLINED: "Refusé",
  CANCELLED: "Annulé",
  COMPLETED: "Terminé",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function getAccessState(access: PortalAccess) {
  if (access.revokedAt) return { label: "Révoqué", className: "bg-muted text-muted-foreground" }
  if (new Date(access.expiresAt).getTime() <= Date.now()) return { label: "Expiré", className: "bg-amber-50 text-amber-700" }
  return { label: "Actif", className: "bg-emerald-50 text-emerald-700" }
}

export function ClientPortalPanel({
  clientId,
  contacts,
  accesses,
  messages,
  appointments,
}: {
  clientId: string
  contacts: Contact[]
  accesses: PortalAccess[]
  messages: PortalMessage[]
  appointments: Appointment[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [contactId, setContactId] = React.useState(contacts[0]?.id ?? "")
  const [label, setLabel] = React.useState("")
  const [validityDays, setValidityDays] = React.useState("30")
  const [oneTimeUrl, setOneTimeUrl] = React.useState("")
  const [reply, setReply] = React.useState("")
  const [appointmentDrafts, setAppointmentDrafts] = React.useState(() =>
    Object.fromEntries(appointments.map((appointment) => [appointment.id, {
      status: appointment.status,
      response: appointment.response ?? "",
    }]))
  )

  function run(task: () => Promise<void>) {
    startTransition(() => {
      void task().catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible."))
    })
  }

  function createAccess() {
    run(async () => {
      const result = await createClientPortalAccess({ clientId, contactId, label, validityDays })
      const url = `${window.location.origin}${result.portalPath}`
      setOneTimeUrl(url)
      await navigator.clipboard.writeText(url).catch(() => undefined)
      toast.success("Accès créé. Le lien a été copié.")
      router.refresh()
    })
  }

  function copyUrl() {
    void navigator.clipboard.writeText(oneTimeUrl).then(
      () => toast.success("Lien copié."),
      () => toast.error("Copie impossible. Sélectionnez le lien manuellement.")
    )
  }

  return (
    <Card id="portail-client" className="overflow-hidden">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />Portail client</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Partagez les dossiers, documents et rendez-vous sans créer de compte. Chaque lien est limité dans le temps et révocable.
            </CardDescription>
          </div>
          <Badge variant="outline">{accesses.filter((item) => !item.revokedAt && new Date(item.expiresAt) > new Date()).length} accès actif(s)</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 p-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-5">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /><h3 className="text-sm font-semibold">Créer un accès portail</h3></div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Le lien secret n’est affiché qu’après sa création. Envoyez-le au contact par un canal approprié.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="portal-contact">Contact destinataire</Label>
                <select id="portal-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm">
                  <option value="">Accès générique au client</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}{contact.email ? ` — ${contact.email}` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-label">Libellé interne</Label>
                <Input id="portal-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex. Direction, chantier…" maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-validity">Validité</Label>
                <select id="portal-validity" value={validityDays} onChange={(event) => setValidityDays(event.target.value)} className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm">
                  <option value="7">7 jours</option><option value="30">30 jours</option><option value="60">60 jours</option><option value="90">90 jours</option>
                </select>
              </div>
            </div>
            <Button className="mt-4 w-full" onClick={createAccess} disabled={isPending}>Créer un accès portail</Button>
            {oneTimeUrl && (
              <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-3">
                <Label htmlFor="portal-url">Lien d’accès à copier</Label>
                <div className="mt-2 flex gap-2"><Input id="portal-url" value={oneTimeUrl} readOnly className="font-mono text-xs" /><Button type="button" variant="outline" size="icon" aria-label="Copier le lien" onClick={copyUrl}><Copy /></Button></div>
                <p className="mt-2 text-xs text-muted-foreground">Ce lien donne accès aux données de ce client jusqu’à son expiration ou sa révocation.</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Accès émis</h3>
            {accesses.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun accès émis.</p> : accesses.map((access) => {
              const state = getAccessState(access)
              return <div key={access.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{access.label || `${access.contact?.firstName ?? ""} ${access.contact?.lastName ?? ""}`.trim() || "Accès client"}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${state.className}`}>{state.label}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">Expire le {formatDate(access.expiresAt)}{access.lastUsedAt ? ` · consulté le ${formatDate(access.lastUsedAt)}` : " · jamais consulté"}</p>
                </div>
                {!access.revokedAt && new Date(access.expiresAt) > new Date() && <Button variant="ghost" size="icon" aria-label="Révoquer l’accès" disabled={isPending} onClick={() => run(async () => { await revokeClientPortalAccess(access.id); toast.success("Accès révoqué."); router.refresh() })}><X /></Button>}
              </div>
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <div className="flex items-center gap-2"><MessageSquare className="size-4 text-primary" /><h3 className="text-sm font-semibold">Conversation</h3></div>
            <div className="mt-3 max-h-[340px] space-y-3 overflow-y-auto rounded-xl border bg-muted/20 p-3">
              {messages.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Aucun message échangé.</p> : messages.map((message) => (
                <div key={message.id} className={`max-w-[88%] rounded-xl px-3 py-2 ${message.direction === "TEAM" ? "ml-auto bg-primary text-primary-foreground" : "border bg-card"}`}>
                  <div className="flex items-center justify-between gap-3 text-[11px] opacity-75"><span>{message.authorName}</span><time>{formatDate(message.createdAt)}</time></div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2"><Label htmlFor="portal-reply">Répondre au client</Label><Textarea id="portal-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={2000} placeholder="Votre réponse sera visible immédiatement dans le portail…" /><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{reply.length}/2 000</p><Button disabled={isPending || reply.trim().length < 2} onClick={() => run(async () => { await sendTeamPortalMessage({ clientId, body: reply }); setReply(""); toast.success("Réponse envoyée."); router.refresh() })}>Envoyer la réponse</Button></div></div>
          </div>

          <div>
            <div className="flex items-center gap-2"><CalendarClock className="size-4 text-primary" /><h3 className="text-sm font-semibold">Demandes de rendez-vous</h3></div>
            <div className="mt-3 space-y-3">
              {appointments.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucune demande reçue.</p> : appointments.map((appointment) => {
                const draft = appointmentDrafts[appointment.id] ?? { status: appointment.status, response: appointment.response ?? "" }
                return <div key={appointment.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{appointment.subject}</p><p className="mt-1 text-xs text-muted-foreground">Souhaité le {formatDate(appointment.preferredStart)} · {appointment.durationMinutes} min</p>{appointment.alternativeStart && <p className="mt-0.5 text-xs text-muted-foreground">Alternative : {formatDate(appointment.alternativeStart)}</p>}</div><Badge variant="secondary">{appointmentLabels[appointment.status] ?? appointment.status}</Badge></div>
                  {appointment.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-5">{appointment.notes}</p>}
                  <div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                    <select aria-label={`Statut du rendez-vous ${appointment.subject}`} value={draft.status} onChange={(event) => setAppointmentDrafts((current) => ({ ...current, [appointment.id]: { ...draft, status: event.target.value } }))} className="h-10 rounded-[10px] border border-input bg-card px-3 text-sm"><option value="PENDING">À traiter</option><option value="CONFIRMED">Confirmer</option><option value="DECLINED">Refuser</option><option value="CANCELLED">Annuler</option><option value="COMPLETED">Terminé</option></select>
                    <Input aria-label={`Réponse au rendez-vous ${appointment.subject}`} value={draft.response} onChange={(event) => setAppointmentDrafts((current) => ({ ...current, [appointment.id]: { ...draft, response: event.target.value } }))} placeholder="Message au client (heure, consignes…)" maxLength={1000} />
                    <Button variant="outline" disabled={isPending} onClick={() => run(async () => { await updateClientPortalAppointment({ id: appointment.id, ...draft }); toast.success("Demande mise à jour."); router.refresh() })}><Check />Enregistrer</Button>
                  </div>
                </div>
              })}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
