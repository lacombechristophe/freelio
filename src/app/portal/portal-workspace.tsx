"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Loader2, MessageSquare, Send } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Message = { id: string; direction: string; authorName: string; body: string; createdAt: string }
type Appointment = {
  id: string
  subject: string
  preferredStart: string
  alternativeStart: string | null
  durationMinutes: number
  notes: string | null
  status: string
  response: string | null
}

const statusLabels: Record<string, string> = {
  PENDING: "En attente de réponse",
  CONFIRMED: "Confirmé",
  DECLINED: "Non retenu",
  CANCELLED: "Annulé",
  COMPLETED: "Terminé",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error || "Action temporairement indisponible")
  return payload
}

export function PortalWorkspace({ messages, appointments }: { messages: Message[]; appointments: Appointment[] }) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState("")
  const [subject, setSubject] = React.useState("")
  const [preferredStart, setPreferredStart] = React.useState("")
  const [alternativeStart, setAlternativeStart] = React.useState("")
  const [durationMinutes, setDurationMinutes] = React.useState("60")
  const [notes, setNotes] = React.useState("")

  function run(task: () => Promise<void>) {
    startTransition(() => {
      void task().catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible."))
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section id="messages" className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="size-5" /></span>
          <div><h2 className="font-semibold">Messages</h2><p className="text-sm text-muted-foreground">Échangez directement avec l’équipe en charge de votre dossier.</p></div>
        </div>
        <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto rounded-xl bg-muted/30 p-3">
          {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">La conversation est vide.</p> : messages.map((item) => (
            <div key={item.id} className={`max-w-[90%] rounded-xl px-3.5 py-3 ${item.direction === "CUSTOMER" ? "ml-auto bg-primary text-primary-foreground" : "border bg-white"}`}>
              <div className="flex items-center justify-between gap-3 text-[11px] opacity-75"><span>{item.authorName}</span><time>{formatDate(item.createdAt)}</time></div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{item.body}</p>
            </div>
          ))}
        </div>
        <form className="mt-4 space-y-2" onSubmit={(event) => { event.preventDefault(); run(async () => { await postJson("/api/portal/messages", { body: message }); setMessage(""); toast.success("Message envoyé."); router.refresh() }) }}>
          <Label htmlFor="portal-message">Votre message</Label>
          <Textarea id="portal-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={2000} required placeholder="Posez une question ou ajoutez une précision…" />
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{message.length}/2 000</span><Button type="submit" disabled={isPending || message.trim().length < 2}>{isPending ? <Loader2 className="animate-spin" /> : <Send />}Envoyer le message</Button></div>
        </form>
      </section>

      <section id="rendez-vous" className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarPlus className="size-5" /></span>
          <div><h2 className="font-semibold">Rendez-vous</h2><p className="text-sm text-muted-foreground">Proposez deux créneaux ; l’équipe vous confirme ici.</p></div>
        </div>
        {appointments.length > 0 && <div className="mt-5 space-y-2">{appointments.slice(0, 5).map((appointment) => (
          <div key={appointment.id} className="rounded-xl border p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{appointment.subject}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(appointment.preferredStart)} · {appointment.durationMinutes} min</p></div><Badge variant="secondary">{statusLabels[appointment.status] ?? appointment.status}</Badge></div>
            {appointment.response && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-5"><span className="font-medium">Réponse de l’équipe :</span> {appointment.response}</p>}
          </div>
        ))}</div>}
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); run(async () => { await postJson("/api/portal/appointments", { subject, preferredStart, alternativeStart, durationMinutes, notes }); setSubject(""); setPreferredStart(""); setAlternativeStart(""); setNotes(""); toast.success("Demande transmise."); router.refresh() }) }}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="appointment-subject">Objet du rendez-vous</Label><Input id="appointment-subject" value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={3} maxLength={160} placeholder="Ex. Validation technique, visite sur site…" /></div>
          <div className="space-y-1.5"><Label htmlFor="preferred-start">Créneau souhaité</Label><Input id="preferred-start" type="datetime-local" value={preferredStart} onChange={(event) => setPreferredStart(event.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="alternative-start">Autre créneau</Label><Input id="alternative-start" type="datetime-local" value={alternativeStart} onChange={(event) => setAlternativeStart(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="appointment-duration">Durée</Label><select id="appointment-duration" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className="h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"><option value="30">30 minutes</option><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="appointment-notes">Précisions</Label><Textarea id="appointment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Accès, personnes présentes, contraintes horaires…" /></div>
          <div className="sm:col-span-2"><Button type="submit" className="w-full sm:w-auto" disabled={isPending || !subject.trim() || !preferredStart}>{isPending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}Envoyer la demande</Button></div>
        </form>
      </section>
    </div>
  )
}
