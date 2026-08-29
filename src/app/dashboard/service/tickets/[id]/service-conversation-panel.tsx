"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Link2, Mail, MessageSquareText, Plus, Send, Sparkles, StickyNote } from "lucide-react"
import { toast } from "sonner"

import { sendCrmEmail } from "@/actions/communications"
import { addServiceTicketNote, linkServiceTicketThread } from "@/actions/service-conversations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Ticket = NonNullable<Awaited<ReturnType<typeof import("@/actions/operations").getServiceTicketDetail>>>
const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function plainText(html: string | null | undefined) {
  return (html || "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function date(value: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function ServiceConversationPanel({ ticket, readOnly = false }: { ticket: Ticket; readOnly?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const contacts = ticket.client.contacts.filter((contact) => contact.email)
  const writableThreads = ticket.emailThreads.filter((thread) => !thread.mergedFrom)
  const latestThread = writableThreads.at(-1)
  const subjectRef = React.useRef<HTMLInputElement>(null)
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)
  const timeline = [
    ...ticket.notes.map((note) => ({ id: note.id, kind: "NOTE" as const, at: note.createdAt, body: note.body, author: note.authorMembership?.user.name || note.authorMembership?.user.email || "Équipe", mergedFrom: note.mergedFrom })),
    ...ticket.emailThreads.flatMap((thread) => thread.messages.map((message) => ({ id: message.id, kind: "EMAIL" as const, at: message.receivedAt || message.sentAt || message.createdAt, body: message.bodyText || plainText(message.bodyHtml), author: message.direction === "INBOUND" ? message.fromAddress : "Équipe", direction: message.direction, subject: message.subject, status: message.status, events: message.events.map((event) => event.type), mergedFrom: thread.mergedFrom }))),
  ].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())

  function run(task: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    startTransition(() => void task().then(() => { form?.reset(); toast.success(success); router.refresh() }).catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))
  }

  return <Card>
    <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="size-4 text-primary" />Conversation et notes</CardTitle><CardDescription className="mt-1">{readOnly ? "Historique conservé en lecture seule après fusion." : "Les e-mails client et les notes internes restent dans une chronologie unique, avec une nature clairement distincte."}</CardDescription></div><HelpTip label="Différence entre e-mail et note">Un e-mail est envoyé au client via le canal configuré. Une note interne n’est visible que par l’équipe.</HelpTip></div></CardHeader>
    <CardContent className="space-y-5">
      {!readOnly && ticket.client.emailThreads.length > 0 && <form className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; run(() => linkServiceTicketThread({ ticketId: ticket.id, threadId: new FormData(form).get("threadId") }), "Conversation rattachée au ticket.", form) }}><select name="threadId" required aria-label="Conversation client à rattacher" className={`${controlClass} flex-1`}><option value="">Rattacher une conversation existante…</option>{ticket.client.emailThreads.map((thread) => <option key={thread.id} value={thread.id}>{thread.subject} · {date(thread.lastMessageAt)}</option>)}</select><Button type="submit" size="sm" variant="outline" disabled={pending}><Link2 />Rattacher</Button></form>}

      <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-xl border bg-muted/15 p-3">
        {timeline.length ? timeline.map((item) => item.kind === "NOTE" ? <article key={`note-${item.id}`} className="mr-4 rounded-lg border bg-amber-50/70 p-3 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><div className="flex flex-wrap items-center gap-2"><StickyNote className="size-3.5" /><Badge variant="outline">Note interne</Badge><span className="text-xs font-medium">{item.author}</span>{item.mergedFrom && <Link href={`/dashboard/service/tickets/${item.mergedFrom.id}`} className="text-[11px] font-medium underline">via {item.mergedFrom.number}</Link>}<span className="ml-auto text-[11px] opacity-70">{date(item.at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.body}</p></article> : <article key={`email-${item.id}`} className={`rounded-lg border bg-background p-3 ${item.direction === "OUTBOUND" ? "ml-4" : "mr-4"}`}><div className="flex flex-wrap items-center gap-2"><Mail className="size-3.5 text-primary" /><Badge variant={item.direction === "INBOUND" ? "secondary" : "outline"}>{item.direction === "INBOUND" ? "Client → équipe" : "Équipe → client"}</Badge><span className="truncate text-xs font-medium">{item.author}</span>{item.mergedFrom && <Link href={`/dashboard/service/tickets/${item.mergedFrom.id}`} className="text-[11px] font-medium text-primary underline">via {item.mergedFrom.number}</Link>}<span className="ml-auto text-[11px] text-muted-foreground">{date(item.at)}</span></div><p className="mt-2 text-sm font-semibold">{item.subject}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.body || "Message HTML sans version texte."}</p><p className="mt-2 text-[11px] text-muted-foreground">{item.status}{item.events.length ? ` · ${item.events.at(-1)}` : ""}</p></article>) : <p className="py-10 text-center text-sm text-muted-foreground">Aucun échange rattaché. Répondez au client ou rattachez une conversation existante.</p>}
      </div>

      {!readOnly && <div className="grid gap-4 lg:grid-cols-2">
        <form key={`reply-${latestThread?.id || "new"}`} className="space-y-3 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const body = String(data.get("body") || ""); run(() => sendCrmEmail({ serviceTicketId: ticket.id, threadId: data.get("threadId"), contactId: data.get("contactId"), subject: data.get("subject"), bodyHtml: `<p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>` }), "Réponse envoyée et rattachée au ticket.", form) }}><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Répondre au client</h3><HelpTip label="Canal d’envoi">L’envoi exige un canal Resend actif. Google et Microsoft seront proposés après autorisation OAuth.</HelpTip></div><div className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2"><Label htmlFor={`ticket-macro-${ticket.id}`} className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-primary" />Macro de réponse</Label><Link href="/dashboard/service/macros" className="text-xs font-medium text-primary hover:underline">Gérer</Link></div><select id={`ticket-macro-${ticket.id}`} aria-label="Macro de réponse" defaultValue="" className={`${controlClass} mt-1.5`} onChange={(event) => { const macro = ticket.macros.find((item) => item.id === event.target.value); if (!macro) return; if (subjectRef.current) subjectRef.current.value = macro.subject; if (bodyRef.current) bodyRef.current.value = macro.bodyText }}><option value="">Choisir une macro…</option>{ticket.macros.map((macro) => <option key={macro.id} value={macro.id}>{macro.name}</option>)}</select>{ticket.macros.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Aucune macro active. Créez-en une puis revenez au ticket.</p>}</div><div><Label htmlFor={`ticket-contact-${ticket.id}`}>Destinataire</Label><select id={`ticket-contact-${ticket.id}`} name="contactId" required defaultValue={contacts[0]?.id || ""} className={`${controlClass} mt-1.5`}><option value="">Choisir un contact…</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} · {contact.email}</option>)}</select></div><div><Label htmlFor={`ticket-thread-${ticket.id}`}>Conversation</Label><select id={`ticket-thread-${ticket.id}`} name="threadId" defaultValue={latestThread?.id || ""} className={`${controlClass} mt-1.5`}><option value="">Nouvelle conversation</option>{writableThreads.map((thread) => <option key={thread.id} value={thread.id}>{thread.subject}</option>)}</select>{ticket.emailThreads.length > writableThreads.length && <p className="mt-1 text-[11px] text-muted-foreground">Les conversations issues d’un ticket fusionné restent visibles dans l’historique mais en lecture seule pour préserver une restauration exacte.</p>}</div><div><Label htmlFor={`ticket-subject-${ticket.id}`}>Objet</Label><Input ref={subjectRef} id={`ticket-subject-${ticket.id}`} name="subject" className="mt-1.5" required defaultValue={latestThread ? `Re: ${latestThread.subject}` : `${ticket.number} · ${ticket.title}`} /></div><div><Label htmlFor={`ticket-body-${ticket.id}`}>Message</Label><Textarea ref={bodyRef} id={`ticket-body-${ticket.id}`} name="body" className="mt-1.5" rows={5} required minLength={3} placeholder="Bonjour, voici la mise à jour de votre demande…" /></div><Button type="submit" disabled={pending || contacts.length === 0}><Send />Envoyer la réponse</Button>{contacts.length === 0 && <p className="text-xs text-danger">Ajoutez une adresse e-mail à un contact client avant de répondre.</p>}</form>

        <form className="space-y-3 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; run(() => addServiceTicketNote({ ticketId: ticket.id, body: new FormData(form).get("body") }), "Note interne ajoutée.", form) }}><div><h3 className="text-sm font-semibold">Ajouter une note interne</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Diagnostic provisoire, appel téléphonique, attente fournisseur ou information de coordination.</p></div><div><Label htmlFor={`ticket-note-${ticket.id}`}>Note</Label><Textarea id={`ticket-note-${ticket.id}`} name="body" className="mt-1.5" rows={6} required minLength={2} placeholder="Compte rendu réservé à l’équipe…" /></div><Button type="submit" variant="outline" disabled={pending}><Plus />Ajouter la note</Button></form>
      </div>}
    </CardContent>
  </Card>
}
