"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Activity, Archive, CheckCircle2, ChevronRight, Eye, Inbox, Info, KeyRound, LockKeyhole, Mail, MailCheck, MailOpen, MousePointerClick, PlugZap, RefreshCw, Reply, Send, Settings2, Unplug, XCircle } from "lucide-react"
import { toast } from "sonner"

import { configureCommunicationChannel, disconnectCommunicationChannel, sendCrmEmail, syncCommunicationChannel, updateEmailThread } from "@/actions/communications"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useConfirm } from "@/components/shared/confirm-provider"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type CommunicationData = {
  company: { name: string; email: string | null }
  channels: Array<{ id: string; provider: string; emailAddress: string; displayName: string | null; status: string; connectionMode: string | null; hasCredentials: boolean; lastSyncAt: string | null; lastError: string | null }>
  contacts: Array<{ id: string; firstName: string; lastName: string; email: string | null; client: { id: string; name: string } }>
  stats: { sent: number; received: number; events: Record<string, number> }
  threads: Array<{
    id: string; subject: string; status: string; unreadCount: number; lastMessageAt: string
    client: { id: string; name: string } | null
    contact: { id: string; firstName: string; lastName: string; email: string | null } | null
    leadCapture: { id: string; firstName: string; lastName: string; email: string | null } | null
    messages: Array<{
      id: string; direction: string; provider: string; fromAddress: string; toAddresses: unknown; ccAddresses: unknown; subject: string; bodyHtml: string | null; bodyText: string | null; attachments: unknown; status: string; sentAt: string | null; receivedAt: string | null; createdAt: string
      events: Array<{ id: string; type: string; occurredAt: string; payload: unknown }>
    }>
  }>
}

const eventLabels: Record<string, string> = { "email.sent": "Envoyé", "email.delivered": "Livré", "email.opened": "Ouvert", "email.clicked": "Cliqué", "email.bounced": "Rejeté", "email.failed": "Échec", "email.complained": "Spam", "email.received": "Reçu" }
const statusLabels: Record<string, string> = { SENT: "Envoyé", DELIVERED: "Livré", OPENED: "Ouvert", CLICKED: "Cliqué", BOUNCED: "Rejeté", FAILED: "Échec", RECEIVED: "Reçu", DELAYED: "Retardé", COMPLAINED: "Spam", SUPPRESSED: "Bloqué" }
type IntegrationProvider = "RESEND" | "GOOGLE" | "MICROSOFT"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function recipients(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : ""
}

function previewDocument(html: string | null, plainText: string | null) {
  const fallback = (plainText || "Aucun contenu").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!)
  const content = html
    ? html.replace(/<(script|iframe|object|embed|form|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<(script|iframe|object|embed|form|meta|base)\b[^>]*\/?>/gi, "").replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
    : `<p style="white-space:pre-wrap">${fallback}</p>`
  // impeccable-disable-next-line overused-font -- Email preview deliberately uses a broadly supported email-client fallback stack.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width"><style>body{font-family:Arial,sans-serif;color:#182230;line-height:1.55;margin:24px}img{max-width:100%;height:auto}a{color:#1768ff}</style></head><body>${content}</body></html>`
}

export function CommunicationCenter({ initialData, initialTab = "inbox" }: { initialData: CommunicationData; initialTab?: string }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [isPending, startTransition] = React.useTransition()
  const [tab, setTab] = React.useState(initialTab)
  const [selectedId, setSelectedId] = React.useState(initialData.threads[0]?.id ?? "")
  const [previewMessage, setPreviewMessage] = React.useState<CommunicationData["threads"][number]["messages"][number] | null>(null)
  const selected = initialData.threads.find((thread) => thread.id === selectedId) ?? initialData.threads[0]
  const [contactId, setContactId] = React.useState("")
  const activeChannels = initialData.channels.filter((channel) => channel.status === "ACTIVE")
  const [channelId, setChannelId] = React.useState(activeChannels[0]?.id ?? "")
  const [subject, setSubject] = React.useState("")
  const [bodyHtml, setBodyHtml] = React.useState("<p>Bonjour,</p><p></p><p>Bien cordialement,</p>")
  const [showComposePreview, setShowComposePreview] = React.useState(false)
  const [integrationProvider, setIntegrationProvider] = React.useState<IntegrationProvider>("RESEND")
  const [integrationDialogOpen, setIntegrationDialogOpen] = React.useState(false)
  const [integrationEmail, setIntegrationEmail] = React.useState("")
  const [integrationDisplayName, setIntegrationDisplayName] = React.useState("")
  const delivered = initialData.stats.events["email.delivered"] ?? 0
  const opened = initialData.stats.events["email.opened"] ?? 0
  const clicked = initialData.stats.events["email.clicked"] ?? 0
  const bounced = initialData.stats.events["email.bounced"] ?? 0

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const error = params.get("integrationError")
    if (connected) toast.success(`${connected === "google" ? "Google Workspace" : "Microsoft 365"} est connecté.`)
    if (error) {
      const message = ({ consent_denied: "Autorisation annulée.", account_mismatch: "Le compte autorisé ne correspond pas à l’adresse déclarée.", oauth_not_configured: "OAuth n’est pas encore configuré sur le serveur.", state_mismatch: "La session d’autorisation a expiré. Recommencez la connexion." } as Record<string, string>)[error] || "Connexion au fournisseur impossible."
      toast.error(message)
    }
    if (connected || error) router.replace("/dashboard/communications?tab=integrations", { scroll: false })
  }, [router])

  function openIntegration(provider: IntegrationProvider) {
    const channel = initialData.channels.find((item) => item.provider === provider)
    setIntegrationProvider(provider)
    setIntegrationEmail(channel?.emailAddress ?? "")
    setIntegrationDisplayName(channel?.displayName ?? "")
    setIntegrationDialogOpen(true)
  }

  async function disconnectIntegration(channelId: string) {
    const confirmed = await confirmDialog({ title: "Déconnecter cette messagerie ?", description: "Les jetons et clés enregistrés seront supprimés. L’historique des messages reste conservé.", confirmLabel: "Déconnecter", destructive: true })
    if (!confirmed) return
    run(async () => { await disconnectCommunicationChannel(channelId); toast.success("Messagerie déconnectée."); router.refresh() })
  }

  function syncIntegration(channelId: string) {
    run(async () => {
      const result = await syncCommunicationChannel(channelId)
      toast.success(result.imported ? `${result.imported} nouveau(x) message(s) synchronisé(s).` : "Messagerie déjà à jour.")
      router.refresh()
    })
  }

  function run(task: () => Promise<void>) {
    startTransition(() => void task().catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))
  }

  function selectThread(thread: CommunicationData["threads"][number]) {
    setSelectedId(thread.id)
    if (thread.unreadCount) run(async () => { await updateEmailThread(thread.id, { markRead: true }); router.refresh() })
  }

  function prepareReply() {
    if (!selected?.contact?.id) return toast.error("Associez cette conversation à un contact avant de répondre.")
    setContactId(selected.contact.id)
    setSubject(`Re: ${selected.subject}`)
    setBodyHtml("<p>Bonjour,</p><p></p><p>Bien cordialement,</p>")
    setTab("compose")
  }

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Send} label="E-mails envoyés" value={initialData.stats.sent} hint="30 derniers jours" />
      <Metric icon={Inbox} label="E-mails reçus" value={initialData.stats.received} hint="30 derniers jours" />
      <Metric icon={MailOpen} label="Taux d’ouverture" value={delivered ? `${Math.round(opened / delivered * 100)} %` : "—"} hint={`${opened} ouverture(s) mesurée(s)`} />
      <Metric icon={MousePointerClick} label="Taux de clic" value={delivered ? `${Math.round(clicked / delivered * 100)} %` : "—"} hint={`${bounced} rejet(s)`} />
    </div>

    <Tabs value={tab} onValueChange={(value) => setTab(value as string)} className="space-y-5">
      <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
        <TabsTrigger value="inbox">Boîte de réception{initialData.threads.reduce((sum, item) => sum + item.unreadCount, 0) ? <Badge className="ml-1">{initialData.threads.reduce((sum, item) => sum + item.unreadCount, 0)}</Badge> : null}</TabsTrigger>
        <TabsTrigger value="compose">Nouvel e-mail</TabsTrigger>
        <TabsTrigger value="analytics">Statistiques</TabsTrigger>
        <TabsTrigger value="integrations">Intégrations</TabsTrigger>
      </TabsList>

      <TabsContent value="inbox">
        <Card className="overflow-hidden"><CardContent className="grid min-h-[620px] p-0 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="border-b lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b p-4"><div><p className="text-sm font-semibold">Conversations</p><p className="text-xs text-muted-foreground">{initialData.threads.length} fil(s)</p></div><Button variant="ghost" size="icon" title="Actualiser" onClick={() => router.refresh()}><RefreshCw /></Button></div>
            <div className="max-h-[555px] overflow-y-auto">{initialData.threads.length ? initialData.threads.map((thread) => {
              const party = thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}` : thread.leadCapture ? `${thread.leadCapture.firstName} ${thread.leadCapture.lastName}` : thread.client?.name || "Expéditeur non identifié"
              const last = thread.messages.at(-1)
              return <button type="button" key={thread.id} onClick={() => selectThread(thread)} className={cn("flex w-full items-start gap-3 border-b p-4 text-left transition-colors hover:bg-muted/40", selected?.id === thread.id && "bg-primary/[0.055]")}>
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", thread.unreadCount ? "bg-primary" : "bg-transparent")} />
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={cn("truncate text-sm", thread.unreadCount && "font-semibold")}>{party}</span><time className="shrink-0 text-[10px] text-muted-foreground">{new Date(thread.lastMessageAt).toLocaleDateString("fr-FR")}</time></span><span className="mt-1 block truncate text-xs font-medium">{thread.subject}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{last?.bodyText || last?.bodyHtml?.replace(/<[^>]+>/g, " ") || "Aucun aperçu"}</span></span><ChevronRight className="mt-3 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            }) : <div className="p-8 text-center"><Inbox className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Aucune conversation</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Connectez une boîte ou envoyez un premier e-mail.</p></div>}</div>
          </div>
          <div className="min-w-0">{selected ? <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{selected.subject}</h2><Badge variant={selected.status === "OPEN" ? "secondary" : "outline"}>{selected.status === "OPEN" ? "Ouvert" : "Clos"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{selected.client?.name || "Non associé à un client"}{selected.contact?.email ? ` · ${selected.contact.email}` : ""}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => run(async () => { await updateEmailThread(selected.id, { status: selected.status === "OPEN" ? "CLOSED" : "OPEN" }); router.refresh() })}>{selected.status === "OPEN" ? <Archive /> : <MailOpen />}{selected.status === "OPEN" ? "Clore" : "Rouvrir"}</Button><Button size="sm" onClick={prepareReply}><Reply />Répondre</Button></div></div>
            <div className="max-h-[530px] space-y-4 overflow-y-auto bg-muted/20 p-5">{selected.messages.map((message) => <article key={message.id} className={cn("rounded-xl border bg-white p-4 shadow-sm", message.direction === "OUTBOUND" && "ml-auto max-w-[92%] border-primary/20")}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{message.direction === "OUTBOUND" ? initialData.company.name : message.fromAddress}</p><Badge variant="outline">{message.direction === "OUTBOUND" ? "Sortant" : "Entrant"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">À : {recipients(message.toAddresses)}</p></div><time className="text-xs text-muted-foreground">{formatDate(message.sentAt || message.receivedAt || message.createdAt)}</time></div>
              <p className="mt-3 text-sm font-medium">{message.subject}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.bodyText || message.bodyHtml?.replace(/<[^>]+>/g, " ") || "Aucun contenu texte"}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"><Button variant="ghost" size="sm" onClick={() => setPreviewMessage(message)}><Eye />Aperçu HTML</Button><Badge variant={message.status === "BOUNCED" || message.status === "FAILED" ? "destructive" : "secondary"}>{["DELIVERED", "OPENED", "CLICKED"].includes(message.status) ? <CheckCircle2 /> : null}{statusLabels[message.status] ?? message.status}</Badge>{message.events.slice(-4).map((event) => <span key={event.id} title={formatDate(event.occurredAt)} className="text-[11px] text-muted-foreground">{eventLabels[event.type] ?? event.type}</span>)}</div>
            </article>)}</div>
          </> : <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">Sélectionnez une conversation.</div>}</div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="compose">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
          <Card><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Nouvel e-mail</CardTitle><HelpTip label="Conseils de rédaction">Gardez un objet court, un seul appel à l’action et vérifiez l’aperçu avant l’envoi. Les variables et séquences marketing se gèrent dans Automatisations.</HelpTip></div><CardDescription>L’envoi sera automatiquement rattaché au client et suivi dans la boîte de réception.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(async () => { await sendCrmEmail({ channelId, contactId, threadId: selected?.contact?.id === contactId && subject.startsWith("Re:") ? selected.id : "", subject, bodyHtml }); toast.success("E-mail envoyé et ajouté à l’historique."); setSubject(""); setBodyHtml("<p>Bonjour,</p><p></p><p>Bien cordialement,</p>"); router.refresh() }) }}>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="email-sender">Expéditeur</Label><select id="email-sender" value={channelId} onChange={(event) => setChannelId(event.target.value)} required className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm"><option value="">Connecter une messagerie…</option>{activeChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName || channel.emailAddress} · {channel.provider === "GOOGLE" ? "Google" : channel.provider === "MICROSOFT" ? "Microsoft" : "Resend"}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="email-contact">Destinataire</Label><select id="email-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm"><option value="">Sélectionner un contact…</option>{initialData.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} · {contact.email} — {contact.client.name}</option>)}</select></div></div>
            <div className="space-y-1.5"><Label htmlFor="email-subject">Objet</Label><Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={2} maxLength={180} /></div>
            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor="email-html">Contenu HTML</Label><span className="text-xs text-muted-foreground">Balises simples autorisées</span></div><Textarea id="email-html" value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} rows={14} required minLength={10} maxLength={100000} className="font-mono text-xs" /></div>
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowComposePreview(true)}><Eye />Vérifier l’aperçu</Button><Button type="submit" disabled={isPending || !channelId || !contactId || subject.trim().length < 2 || bodyHtml.trim().length < 10}>{isPending ? <Activity className="animate-spin" /> : <Send />}Envoyer maintenant</Button></div>
          </form></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Aperçu sécurisé</CardTitle><CardDescription>Les scripts, formulaires et images distantes sont bloqués dans cet aperçu.</CardDescription></CardHeader><CardContent><iframe title="Aperçu du nouvel e-mail" sandbox="" srcDoc={previewDocument(bodyHtml, null)} className="h-[560px] w-full rounded-xl border bg-white" /></CardContent></Card>
        </div>
      </TabsContent>

      <TabsContent value="analytics" className="space-y-5">
        <Card><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Performance sur 30 jours</CardTitle><HelpTip label="Comprendre les statistiques">Une ouverture peut être déclenchée par les protections de messagerie. Les clics et réponses restent généralement plus fiables pour mesurer l’intérêt.</HelpTip></div><CardDescription>Mesures issues des événements signés du fournisseur d’envoi.</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2"><FunnelRow label="Envoyés" value={initialData.stats.sent} total={Math.max(initialData.stats.sent, 1)} icon={Send} /><FunnelRow label="Livrés" value={delivered} total={Math.max(initialData.stats.sent, 1)} icon={MailCheck} /><FunnelRow label="Ouverts" value={opened} total={Math.max(delivered, 1)} icon={MailOpen} /><FunnelRow label="Cliqués" value={clicked} total={Math.max(delivered, 1)} icon={MousePointerClick} /><FunnelRow label="Rejetés" value={bounced} total={Math.max(initialData.stats.sent, 1)} icon={XCircle} /></CardContent></Card>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><Info className="mr-2 inline size-4" />Conseil : surveillez surtout les rejets et plaintes, puis comparez les réponses et clics entre modèles. Un taux d’ouverture seul ne suffit pas à juger une campagne.</div>
      </TabsContent>

      <TabsContent value="integrations" className="space-y-5">
        <div className="rounded-xl border border-border bg-muted/25 p-4"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Vos accès restent sous votre contrôle</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Resend accepte une clé dédiée fournie par l’entreprise. Google et Microsoft utilisent une autorisation OAuth : le mot de passe n’est jamais transmis au CRM et les jetons sont chiffrés au repos.</p></div></div></div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ProviderCard name="Resend" provider="RESEND" description="Envoi, réception et statistiques par webhook avec votre propre compte." channels={initialData.channels} onConfigure={() => openIntegration("RESEND")} onDisconnect={disconnectIntegration} onSync={syncIntegration} />
          <ProviderCard name="Google Workspace" provider="GOOGLE" description="Envoi et synchronisation Gmail en quelques clics, sans partager le mot de passe." channels={initialData.channels} onConfigure={() => openIntegration("GOOGLE")} onDisconnect={disconnectIntegration} onSync={syncIntegration} />
          <ProviderCard name="Microsoft 365" provider="MICROSOFT" description="Envoi et synchronisation Outlook via Microsoft Graph et OAuth." channels={initialData.channels} onConfigure={() => openIntegration("MICROSOFT")} onDisconnect={disconnectIntegration} onSync={syncIntegration} />
        </div>
      </TabsContent>
    </Tabs>

    <Dialog open={integrationDialogOpen} onOpenChange={setIntegrationDialogOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><KeyRound className="size-4" /></div><DialogTitle>Connecter {integrationProvider === "RESEND" ? "Resend" : integrationProvider === "GOOGLE" ? "Google Workspace" : "Microsoft 365"}</DialogTitle><DialogDescription>{integrationProvider === "RESEND" ? "Utilisez une clé de votre compte et le secret du webhook créé pour ce CRM." : "Déclarez l’adresse attendue, puis autorisez le compte correspondant chez le fournisseur."}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(async () => { const result = await configureCommunicationChannel({ provider: integrationProvider, emailAddress: integrationEmail, displayName: integrationDisplayName, apiKey: form.get("apiKey"), webhookSecret: form.get("webhookSecret") }); if (result.connectPath) { window.location.assign(result.connectPath); return } toast.success("Resend est prêt pour les envois et événements."); setIntegrationDialogOpen(false); router.refresh() }) }}>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="integration-email">Adresse de messagerie</Label><Input id="integration-email" type="email" required value={integrationEmail} onChange={(event) => setIntegrationEmail(event.target.value)} placeholder="contact@votre-domaine.fr" /></div><div className="space-y-1.5"><Label htmlFor="integration-name">Nom d’affichage</Label><Input id="integration-name" value={integrationDisplayName} onChange={(event) => setIntegrationDisplayName(event.target.value)} placeholder="Équipe commerciale" /></div></div>
          {integrationProvider === "RESEND" ? <div className="space-y-4 rounded-xl border bg-muted/25 p-4"><div className="space-y-1.5"><Label htmlFor="resend-api-key">Clé API Resend</Label><Input id="resend-api-key" name="apiKey" type="password" autoComplete="off" placeholder="re_••••••••••••" /><p className="text-[11px] leading-5 text-muted-foreground">Laissez vide pour conserver la clé enregistrée. Une clé limitée à l’envoi suffit sans boîte de réception ; l’accès complet est requis pour récupérer les messages entrants.</p></div><div className="space-y-1.5"><Label htmlFor="resend-webhook-secret">Secret de signature webhook</Label><Input id="resend-webhook-secret" name="webhookSecret" type="password" autoComplete="off" placeholder="whsec_••••••••••••" /></div><div className="rounded-lg border bg-background px-3 py-2 text-[11px] leading-5 text-muted-foreground">URL à ajouter au domaine de production : <code className="font-mono text-foreground">/api/webhooks/resend</code></div></div> : <div className="rounded-xl border bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">Vous serez redirigé vers le fournisseur. Le CRM demande uniquement l’accès aux e-mails, avec accès hors ligne pour les synchronisations planifiées.</div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIntegrationDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={isPending || !integrationEmail}><PlugZap className="size-4" />{integrationProvider === "RESEND" ? "Enregistrer la connexion" : "Continuer avec OAuth"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(previewMessage)} onOpenChange={(open) => { if (!open) setPreviewMessage(null) }}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>{previewMessage?.subject}</DialogTitle><DialogDescription>De {previewMessage?.fromAddress} · à {recipients(previewMessage?.toAddresses)}</DialogDescription></DialogHeader><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]"><iframe title="Aperçu HTML de l’e-mail" sandbox="" srcDoc={previewDocument(previewMessage?.bodyHtml ?? null, previewMessage?.bodyText ?? null)} className="h-[620px] w-full rounded-xl border bg-white" /><aside className="space-y-3 rounded-xl bg-muted/40 p-4"><p className="text-xs font-semibold text-muted-foreground">Chronologie</p>{previewMessage?.events.length ? previewMessage.events.map((event) => <div key={event.id} className="flex gap-2 text-xs"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><span><span className="block font-medium">{eventLabels[event.type] ?? event.type}</span><time className="text-muted-foreground">{formatDate(event.occurredAt)}</time></span></div>) : <p className="text-xs text-muted-foreground">Aucun événement supplémentaire.</p>}</aside></div></DialogContent></Dialog>
    <Dialog open={showComposePreview} onOpenChange={setShowComposePreview}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Aperçu avant envoi</DialogTitle><DialogDescription>{subject || "Sans objet"}</DialogDescription></DialogHeader><iframe title="Aperçu final" sandbox="" srcDoc={previewDocument(bodyHtml, null)} className="h-[620px] w-full rounded-xl border bg-white" /></DialogContent></Dialog>
  </div>
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Mail; label: string; value: number | string; hint: string }) { return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs font-medium">{label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p></div></CardContent></Card> }
function FunnelRow({ label, value, total, icon: Icon }: { label: string; value: number; total: number; icon: typeof Mail }) { const percent = Math.min(100, Math.round(value / total * 100)); return <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-primary" />{label}</span><span className="font-semibold tabular-nums">{value} <span className="text-xs font-normal text-muted-foreground">({percent} %)</span></span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div></div> }
function ProviderCard({ name, provider, description, channels, onConfigure, onDisconnect, onSync }: { name: string; provider: IntegrationProvider; description: string; channels: CommunicationData["channels"]; onConfigure: () => void; onDisconnect: (channelId: string) => Promise<void>; onSync: (channelId: string) => void }) {
  const channel = channels.find((item) => item.provider === provider)
  const ready = channel?.status === "ACTIVE"
  return <Card className="flex min-h-64 flex-col"><CardHeader className="flex-1"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><Settings2 className="size-4" /></span><Badge variant={ready ? "secondary" : "outline"}>{ready ? "Connecté" : channel ? "À terminer" : "Non connecté"}</Badge></div><CardTitle className="mt-3 text-base">{name}</CardTitle><CardDescription className="leading-5">{description}</CardDescription>{channel ? <div className="mt-4 border-t pt-3"><p className="text-xs font-medium">{channel.emailAddress}</p><p className="mt-1 text-[11px] text-muted-foreground">{channel.connectionMode === "BYOK" ? "Clés gérées par votre entreprise" : channel.connectionMode === "OAUTH" ? "Autorisation OAuth chiffrée" : "Configuration à finaliser"}</p>{channel.lastSyncAt ? <p className="mt-1 text-[11px] text-muted-foreground">Dernière synchro : {formatDate(channel.lastSyncAt)}</p> : null}{channel.lastError ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{channel.lastError}</p> : null}</div> : null}</CardHeader><CardContent className="flex gap-2 border-t pt-4">{ready && channel && provider !== "RESEND" ? <Button type="button" size="sm" className="flex-1" onClick={() => onSync(channel.id)}><RefreshCw className="size-4" />Synchroniser</Button> : <Button type="button" size="sm" variant={ready ? "outline" : "default"} className="flex-1" onClick={onConfigure}>{ready ? "Gérer" : provider === "RESEND" ? "Ajouter mes clés" : "Connecter"}</Button>}{ready && channel && provider !== "RESEND" ? <Button type="button" size="sm" variant="outline" onClick={onConfigure}>Gérer</Button> : null}{ready && channel ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Déconnecter ${name}`} onClick={() => void onDisconnect(channel.id)}><Unplug className="size-4 text-danger" /></Button> : null}</CardContent></Card>
}
