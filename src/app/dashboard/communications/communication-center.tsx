"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Activity, Archive, ArrowLeft, CheckCircle2, ChevronRight, Eye, Forward, Inbox, Info, KeyRound, LockKeyhole, Mail, MailCheck, MailOpen, MousePointerClick, PlugZap, RefreshCw, Reply, Send, Settings2, Unplug, XCircle } from "lucide-react"
import { toast } from "sonner"

import { configureCommunicationChannel, disconnectCommunicationChannel, getCommunicationInboxPage, getPreviousCommunicationMessages, getCommunicationDraft, saveCommunicationDraft, deleteCommunicationDraft, getCommunicationReplyAll, getCommunicationForward, scheduleCommunicationDraft, cancelCommunicationDraftSchedule, sendCrmEmail, syncCommunicationChannel, updateEmailThread, previewCommunicationEmail } from "@/actions/communications"
import type { EmailDraftDto } from "@/lib/communications/drafts"
import { parseCopyRecipients } from "@/lib/communications/recipients"
import { uploadEmailAttachment, removeEmailAttachment } from "@/lib/communications/client-attachments"
import { MAX_EMAIL_FILE_BYTES } from "@/lib/communications/attachment-types"
import { DraftList } from "./draft-list"
import { SignatureEditor } from "./signature-editor"
import { insertEmailSignature, type EmailSignatureDto } from "@/lib/communications/signature-input"
import type { InboxPage } from "@/lib/communications/inbox-reader"
import type { RecipientPage } from "@/lib/communications/recipient-reader"
import { RecipientPicker } from "./recipient-picker"
import { scheduledEmailLocalTime } from "@/lib/communications/scheduled-time"
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
import { isReadOnlyDemo } from "@/lib/demo-mode"

type CommunicationData = {
  company: { id: string; name: string; email: string | null }
  signature: EmailSignatureDto
  signatureOwnerId: string
  channels: Array<{ id: string; provider: string; emailAddress: string; displayName: string | null; status: string; connectionMode: string | null; hasCredentials: boolean; lastSyncAt: string | null; lastError: string | null; visibility?: string; mailEnabled?: boolean; calendarEnabled?: boolean; emailSyncStatus?: unknown; calendarSyncStatus?: unknown }>
  recipients: RecipientPage
  stats: { sent: number; received: number; unread: number; events: Record<string, number> }
  threads: InboxPage["threads"]
  inbox: InboxPage
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
  const [loadedInbox, setLoadedInbox] = React.useState<InboxPage | null>(null)
  const inbox = loadedInbox ?? initialData.inbox
  const [search, setSearch] = React.useState("")
  const inboxRequest = React.useRef(0)
  const [history, setHistory] = React.useState<{ threadId: string; messages: InboxPage["threads"][number]["messages"]; hasPreviousMessages: boolean } | null>(null)
  const [selectedId, setSelectedId] = React.useState(initialData.threads[0]?.id ?? "")
  const [mobileThreadOpen, setMobileThreadOpen] = React.useState(false)
  const threadListRef = React.useRef<HTMLDivElement>(null)
  const backToListRef = React.useRef<HTMLButtonElement>(null)
  const [previewMessage, setPreviewMessage] = React.useState<CommunicationData["threads"][number]["messages"][number] | null>(null)
  const selected = inbox.threads.find((thread) => thread.id === selectedId) ?? inbox.threads[0]
  const selectedMessages = history?.threadId === selected?.id ? history.messages : selected?.messages ?? []
  const hasPreviousMessages = history?.threadId === selected?.id ? history.hasPreviousMessages : selected?.hasPreviousMessages
  const [contactId, setContactId] = React.useState("")
  const activeChannels = initialData.channels.filter((channel) => channel.status === "ACTIVE")
  const [channelId, setChannelId] = React.useState(activeChannels[0]?.id ?? "")
  const [subject, setSubject] = React.useState("")
  const [bodyHtml, setBodyHtml] = React.useState("<p>Bonjour,</p><p></p><p>Bien cordialement,</p>")
  const [cc, setCc] = React.useState("")
  const [bcc, setBcc] = React.useState("")
  const [replyThreadId, setReplyThreadId] = React.useState("")
  const [draft, setDraftState] = React.useState<EmailDraftDto | null>(null)
  const draftRef = React.useRef<EmailDraftDto | null>(null)
  const createDraftKey = React.useRef<string | null>(null)
  const [savedSnapshot, setSavedSnapshotState] = React.useState("")
  const savedSnapshotRef = React.useRef("")
  const [draftNotice, setDraftNotice] = React.useState("")
  const [localDateTime, setLocalDateTime] = React.useState("")
  const [scheduleTimezone, setScheduleTimezone] = React.useState("Europe/Paris")
  const setRecipient = React.useCallback((id: string) => { if (!draft?.scheduledAt) setContactId(id) }, [draft?.scheduledAt])
  const snapshot = JSON.stringify({ channelId, contactId, threadId: replyThreadId, subject, bodyHtml, cc, bcc, attachmentIds: draft?.attachments.map(file => file.id) || [] })
  const latestSnapshot = React.useRef(snapshot)
  React.useLayoutEffect(() => { latestSnapshot.current = snapshot }, [snapshot])
  const [baselineSnapshot, setBaselineSnapshot] = React.useState(snapshot)
  const [isAutosaving, setIsAutosaving] = React.useState(false)
  const [autosaveBlocked, setAutosaveBlocked] = React.useState(false)
  const [failedSnapshot, setFailedSnapshot] = React.useState("")
  const [autosavePaused, setAutosavePausedState] = React.useState(false)
  const autosavePausedRef = React.useRef(false)
  const autosaveJob = React.useRef<Promise<EmailDraftDto | null> | null>(null)
  const needsSave = snapshot !== (savedSnapshot || baselineSnapshot)
  const canAutosave = !isReadOnlyDemo && !autosaveBlocked && !autosavePaused && !draft?.sentAt && !draft?.scheduledAt && needsSave && snapshot !== failedSnapshot
  const attachmentInput = React.useRef<HTMLInputElement>(null)
  const sendIntent = React.useRef<{ signature: string; requestKey: string } | null>(null)
  const [showComposePreview, setShowComposePreview] = React.useState(false)
  const [composePreview, setComposePreview] = React.useState<{ html: string; text: string; subject: string } | null>(null)
  const [showPlainPreview, setShowPlainPreview] = React.useState(false)
  const [integrationProvider, setIntegrationProvider] = React.useState<IntegrationProvider>("RESEND")
  const [integrationDialogOpen, setIntegrationDialogOpen] = React.useState(false)
  const [integrationEmail, setIntegrationEmail] = React.useState("")
  const [integrationDisplayName, setIntegrationDisplayName] = React.useState("")
  const [integrationVisibility, setIntegrationVisibility] = React.useState("PRIVATE")
  const [integrationCapabilities, setIntegrationCapabilities] = React.useState("BOTH")
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

  React.useEffect(() => setTab(initialTab), [initialTab])

  function openIntegration(provider: IntegrationProvider) {
    const channel = initialData.channels.find((item) => item.provider === provider)
    setIntegrationProvider(provider)
    setIntegrationEmail(channel?.emailAddress ?? "")
    setIntegrationDisplayName(channel?.displayName ?? "")
    setIntegrationVisibility(channel?.visibility === "SHARED" ? "SHARED" : "PRIVATE")
    setIntegrationCapabilities(provider === "RESEND" ? "MAIL" : channel?.mailEnabled === false ? "CALENDAR" : channel?.calendarEnabled === false ? "MAIL" : "BOTH")
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
      const imported = result.email.imported + result.calendar.imported
      if (result.email.status !== "SYNCED" || result.calendar.status !== "SYNCED") {
        toast.warning(`Mail : ${syncStatusLabel(result.email)}. Calendrier : ${syncStatusLabel(result.calendar)}. ${[result.email.error, result.calendar.error].filter(Boolean).join(" ")}`)
      } else {
        toast.success(imported ? `${result.email.imported} message(s) et ${result.calendar.imported} événement(s) ajoutés.` : "Messagerie et calendrier déjà à jour.")
      }
      router.refresh()
    })
  }

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try { await task() }
      catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible.") }
    })
  }

  function handleTabChange(value: string) {
    setTab(value)
    router.replace(`/dashboard/communications?tab=${value}`, { scroll: false })
  }

  async function loadInbox(page = inbox.page, filter = inbox.filter, query = inbox.search, selectionId = selectedId) {
    const request = ++inboxRequest.current
    const next = await getCommunicationInboxPage({ page, filter, search: query })
    if (!next || request !== inboxRequest.current) return
    setLoadedInbox(next)
    setHistory(null)
    if (!next.threads.some((thread) => thread.id === selectionId)) {
      setSelectedId(next.threads[0]?.id ?? "")
      setMobileThreadOpen(false)
    }
  }

  function loadPreviousMessages() {
    if (!selected || !selectedMessages[0]) return
    const threadId = selected.id
    const beforeMessageId = selectedMessages[0].id
    run(async () => {
      const previous = await getPreviousCommunicationMessages({ threadId, beforeMessageId })
      if (!previous) return
      setHistory({ threadId, hasPreviousMessages: previous.hasPreviousMessages,
        messages: [...previous.messages, ...selectedMessages].filter((message, index, all) => all.findIndex((item) => item.id === message.id) === index) })
    })
  }

  function selectThread(thread: CommunicationData["threads"][number]) {
    setSelectedId(thread.id)
    setMobileThreadOpen(true)
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) backToListRef.current?.focus()
    })
    if (thread.unreadCount && !isReadOnlyDemo) run(async () => { await updateEmailThread(thread.id, { markRead: true }); await loadInbox(inbox.page, inbox.filter, inbox.search, thread.id); router.refresh() })
  }

  function composeIntent() {
    return { channelId, contactId, threadId: replyThreadId, subject, bodyHtml, cc: parseCopyRecipients(cc), bcc: parseCopyRecipients(bcc), attachmentIds: draft?.attachments.map(file => file.id) || [] }
  }

  function setDraft(next: EmailDraftDto | null) { draftRef.current = next; setDraftState(next) }
  function setSavedSnapshot(next: string) { savedSnapshotRef.current = next; setSavedSnapshotState(next) }
  function pauseAutosave(paused: boolean) { autosavePausedRef.current = paused; setAutosavePausedState(paused) }

  async function saveDraftRevision(capturedSnapshot: string, automatic: boolean) {
    createDraftKey.current ??= crypto.randomUUID()
    try {
      const fields = JSON.parse(capturedSnapshot) as Omit<ReturnType<typeof composeIntent>, "cc" | "bcc"> & { cc: string; bcc: string }
      const result = await saveCommunicationDraft({ ...fields, cc: parseCopyRecipients(fields.cc), bcc: parseCopyRecipients(fields.bcc),
        id: draftRef.current?.id, version: draftRef.current?.version, createKey: createDraftKey.current,
        expectedCompanyId: initialData.company.id, expectedAuthorId: initialData.signatureOwnerId })
      if (!result.success) { setAutosaveBlocked(true); throw new Error(result.error) }
      if (automatic) {
        // Keep the user's current fields, including edits made during this request.
        setDraft(result.draft); setSavedSnapshot(capturedSnapshot); setFailedSnapshot("")
        setDraftNotice(`Brouillon enregistré · version ${result.draft.version}`)
      } else restoreDraft(result.draft, true)
      return result.draft
    } catch (error) {
      setFailedSnapshot(capturedSnapshot)
      setDraftNotice(error instanceof Error ? error.message : "Sauvegarde impossible ; votre texte est conservé")
      throw error
    }
  }

  const startAutosave = React.useEffectEvent(() => {
    if (autosavePausedRef.current || autosaveJob.current) return
    setIsAutosaving(true)
    React.startTransition(async () => {
      const task = saveDraftRevision(snapshot, true).catch(() => null)
      autosaveJob.current = task
      try { await task }
      finally { autosaveJob.current = null; setIsAutosaving(false) }
    })
  })

  React.useEffect(() => {
    if (!canAutosave || isPending || isAutosaving) return
    const timer = setTimeout(() => startAutosave(), 1000)
    return () => clearTimeout(timer)
  }, [snapshot, canAutosave, isPending, isAutosaving])

  function restoreDraft(next: EmailDraftDto, keepScheduleInput = false) {
    const fields = { channelId: next.channelId || "", contactId: next.contactId || "", threadId: next.threadId || "", subject: next.subject, bodyHtml: next.bodyHtml, cc: next.cc.join(", "), bcc: next.bcc.join(", "), attachmentIds: next.attachments.map(file => file.id) }
    setChannelId(fields.channelId); setContactId(fields.contactId); setReplyThreadId(fields.threadId)
    setSubject(fields.subject); setBodyHtml(fields.bodyHtml); setCc(fields.cc); setBcc(fields.bcc)
    setDraft(next); createDraftKey.current = next.createKey; setSavedSnapshot(JSON.stringify(fields))
    setAutosaveBlocked(false); setFailedSnapshot("")
    if (next.scheduledAt && next.scheduledTimezone) {
      setLocalDateTime(scheduledEmailLocalTime(next.scheduledAt, next.scheduledTimezone)); setScheduleTimezone(next.scheduledTimezone)
    } else if (!keepScheduleInput) setLocalDateTime("")
    setDraftNotice(next.sentAt ? "Ce brouillon a déjà été envoyé." : next.scheduledAt ? next.scheduleError || `Envoi programmé pour ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: next.scheduledTimezone || "UTC" }).format(new Date(next.scheduledAt))} · ${next.scheduledTimezone}` : `Brouillon enregistré · version ${next.version}`)
  }

  async function persistDraft() {
    await autosaveJob.current
    return saveDraftRevision(latestSnapshot.current, false)
  }

  async function draftForMutation() {
    await autosaveJob.current
    return draftRef.current && latestSnapshot.current === savedSnapshotRef.current ? draftRef.current : persistDraft()
  }

  async function mayReplaceComposition() {
    pauseAutosave(true)
    await autosaveJob.current
    const current = latestSnapshot.current
    const fields = JSON.parse(current) as { subject: string; cc: string; bcc: string; bodyHtml: string }
    let confirmed = true
    if (savedSnapshotRef.current && current !== savedSnapshotRef.current) confirmed = await confirmDialog({ title: "Remplacer les modifications non enregistrées ?", description: "Votre version enregistrée reste disponible dans Brouillons.", confirmLabel: "Remplacer" })
    else if (!savedSnapshotRef.current && (fields.subject || fields.cc || fields.bcc || fields.bodyHtml !== "<p>Bonjour,</p><p></p><p>Bien cordialement,</p>")) confirmed = await confirmDialog({ title: "Remplacer ce texte non enregistré ?", description: "Enregistrez un brouillon pour le retrouver plus tard.", confirmLabel: "Remplacer" })
    if (!confirmed) pauseAutosave(false)
    return confirmed
  }

  async function submitEmail() {
    await autosaveJob.current
    let intent = composeIntent()
    let saved = draftRef.current
    if (saved && latestSnapshot.current !== savedSnapshotRef.current) saved = await persistDraft()
    if (saved) intent = { ...intent, subject: saved.subject, bodyHtml: saved.bodyHtml, cc: saved.cc, bcc: saved.bcc }
    const signature = JSON.stringify(intent)
    if (sendIntent.current?.signature !== signature) sendIntent.current = { signature, requestKey: crypto.randomUUID() }
    const result = await sendCrmEmail({ ...intent, requestKey: sendIntent.current.requestKey, draftId: saved?.id, draftVersion: saved?.version })
    if (!result.success) { setDraftNotice(result.error); throw new Error(result.error) }
    sendIntent.current = null; setDraft(null); createDraftKey.current = null; setSavedSnapshot(""); setDraftNotice("")
    setReplyThreadId(""); setCc(""); setBcc("")
    toast.success("E-mail envoyé et ajouté à l’historique.")
    setSubject(""); setBodyHtml("<p>Bonjour,</p><p></p><p>Bien cordialement,</p>")
    setLocalDateTime("")
    setBaselineSnapshot(JSON.stringify({ channelId, contactId, threadId: "", subject: "", bodyHtml: "<p>Bonjour,</p><p></p><p>Bien cordialement,</p>", cc: "", bcc: "", attachmentIds: [] }))
    setAutosaveBlocked(false); setFailedSnapshot("")
    router.refresh()
  }

  async function prepareReply(replyAll = false) {
    if (!selected?.contact?.id) return toast.error("Associez cette conversation à un contact avant de répondre.")
    const mailbox = activeChannels.find(channel => channel.id === selected.channelId && channel.mailEnabled !== false)
    if (!mailbox) return toast.error("La boîte de cette conversation est déconnectée ou ne permet plus l’envoi ; reconnectez-la avant de répondre.")
    if (!await mayReplaceComposition()) return
    const contact = selected.contact
    run(async () => {
      try {
        let copies: string[] = []
        if (replyAll) {
          const result = await getCommunicationReplyAll(selected.id)
          if (!result.success) throw new Error(result.error)
          if (result.reply.channelId !== mailbox.id || result.reply.contactId !== contact.id) throw new Error("Cette conversation a changé ; actualisez-la avant de répondre à tous")
          copies = result.reply.cc
        }
        setDraft(null); createDraftKey.current = null; setSavedSnapshot(""); setDraftNotice(""); setCc(copies.join(", ")); setBcc("")
        setReplyThreadId(selected.id); setChannelId(mailbox.id); setContactId(contact.id)
        setSubject(`Re: ${selected.subject}`); setBodyHtml("<p>Bonjour,</p><p></p><p>Bien cordialement,</p>")
        setLocalDateTime("")
        setAutosaveBlocked(false); setFailedSnapshot("")
        handleTabChange("compose")
      } finally { pauseAutosave(false) }
    })
  }

  async function prepareForward(messageId: string) {
    if (!await mayReplaceComposition()) return
    run(async () => {
      try {
        const result = await getCommunicationForward(messageId)
        if (!result.success) throw new Error(result.error)
        setDraft(null); createDraftKey.current = null; setSavedSnapshot(""); setDraftNotice("")
        setContactId(""); setReplyThreadId(""); setCc(""); setBcc("")
        setChannelId(result.forward.channelId || "")
        setSubject(result.forward.subject); setBodyHtml(result.forward.bodyHtml)
        setLocalDateTime("")
        setAutosaveBlocked(false); setFailedSnapshot("")
        handleTabChange("compose")
      } finally { pauseAutosave(false) }
    })
  }

  function previewComposition() {
    run(async () => {
      const content = await previewCommunicationEmail({ bodyHtml })
      if (!content) throw new Error("Aperçu indisponible.")
      setComposePreview({ ...content, subject }); setShowPlainPreview(false); setShowComposePreview(true)
    })
  }

  async function scheduleComposition() {
    const time = { localDateTime, timezone: scheduleTimezone }
    pauseAutosave(true)
    try {
      const saved = await draftForMutation()
      const result = await scheduleCommunicationDraft({ id: saved.id, version: saved.version, ...time })
      if (!result.success) throw new Error(result.error)
      restoreDraft(result.draft)
    } finally { pauseAutosave(false) }
  }

  async function cancelSchedule(listed: { id: string; version: number }) {
    pauseAutosave(true)
    try {
      await autosaveJob.current
      const version = draftRef.current?.id === listed.id ? draftRef.current.version : listed.version
      const result = await cancelCommunicationDraftSchedule({ id: listed.id, version })
      if (!result.success) throw new Error(result.error)
      if (draftRef.current?.id === listed.id) restoreDraft(result.draft)
    } finally { pauseAutosave(false) }
  }

  return <div className="space-y-5">
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-5">
      <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
        <TabsTrigger value="inbox">Boîte de réception{initialData.stats.unread ? <Badge className="ml-1">{initialData.stats.unread}</Badge> : null}</TabsTrigger>
        <TabsTrigger value="compose">Nouvel e-mail</TabsTrigger>
        <TabsTrigger value="drafts">Brouillons</TabsTrigger>
        <TabsTrigger value="analytics">Statistiques</TabsTrigger>
        <TabsTrigger value="integrations">Intégrations</TabsTrigger>
      </TabsList>

      <TabsContent value="inbox">
        <Card className="workspace-panel overflow-hidden"><CardContent className="grid min-h-[420px] grid-cols-1 p-0 lg:min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
          <div ref={threadListRef} className={cn("min-w-0 border-b lg:block lg:border-b-0 lg:border-r", mobileThreadOpen && "hidden")}>
            <div className="flex items-center justify-between border-b p-4"><div><p className="text-sm font-semibold">Conversations</p><p className="text-xs text-muted-foreground">{inbox.total} fil(s)</p></div><Button variant="ghost" size="icon" disabled={isPending} aria-label="Actualiser les conversations" onClick={() => run(async () => { await loadInbox(); router.refresh() })}><RefreshCw /></Button></div>
            <form className="space-y-2 border-b p-4" onSubmit={(event) => { event.preventDefault(); run(() => loadInbox(1, inbox.filter, search)) }}>
              <Label htmlFor="inbox-filter">Conversations affichées</Label><select id="inbox-filter" value={inbox.filter} disabled={isPending} onChange={(event) => run(() => loadInbox(1, event.target.value as InboxPage["filter"], search))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="ALL">Toutes</option><option value="UNREAD">Non lues</option><option value="ARCHIVED">Archives</option></select>
              <Label htmlFor="inbox-search">Recherche</Label><Input id="inbox-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} placeholder="Objet, contact ou message" /><Button demoMutation={false} type="submit" variant="outline" size="sm" disabled={isPending}>Rechercher</Button>
            </form>
            <div className="max-h-[555px] overflow-y-auto" aria-busy={isPending}>{inbox.threads.length ? inbox.threads.map((thread) => {
              const party = thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}` : thread.leadCapture ? `${thread.leadCapture.firstName} ${thread.leadCapture.lastName}` : thread.client?.name || "Expéditeur non identifié"
              const last = thread.messages.at(-1)
              return <button type="button" key={thread.id} data-selected={selected?.id === thread.id} aria-pressed={selected?.id === thread.id} onClick={() => selectThread(thread)} className={cn("flex w-full items-start gap-3 border-b p-4 text-left transition-colors hover:bg-muted/40", selected?.id === thread.id && "bg-primary/[0.055]")}>
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", thread.unreadCount ? "bg-primary" : "bg-transparent")} />
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={cn("truncate text-sm", thread.unreadCount && "font-semibold")}>{party}</span><time className="shrink-0 text-[10px] text-muted-foreground">{new Date(thread.lastMessageAt).toLocaleDateString("fr-FR")}</time></span><span className="mt-1 block truncate text-xs font-medium">{thread.subject}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{last?.bodyText || last?.bodyHtml?.replace(/<[^>]+>/g, " ") || "Aucun aperçu"}</span></span><ChevronRight className="mt-3 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            }) : <div className="p-8 text-center"><Inbox className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Aucune conversation</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Connectez une boîte ou envoyez un premier e-mail.</p></div>}</div>
            <div className="space-y-2 border-t p-4"><p className="text-xs text-muted-foreground">Page {inbox.page} sur {inbox.pageCount}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={isPending || inbox.page <= 1} onClick={() => run(() => loadInbox(inbox.page - 1))}>Page précédente</Button><Button variant="outline" size="sm" disabled={isPending || inbox.page >= inbox.pageCount} onClick={() => run(() => loadInbox(inbox.page + 1))}>Page suivante</Button></div></div>
          </div>
          <div className={cn("min-w-0 break-words lg:block", !mobileThreadOpen && "hidden")}>
            <div className="border-b p-2 lg:hidden"><Button ref={backToListRef} variant="ghost" size="sm" onClick={() => {
              setMobileThreadOpen(false)
              requestAnimationFrame(() => threadListRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"]')?.focus())
            }}><ArrowLeft />Retour aux conversations</Button></div>
            {selected ? <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{selected.subject}</h2><Badge variant={selected.status === "OPEN" ? "secondary" : "outline"}>{selected.status === "OPEN" ? "Ouvert" : "Clos"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{selected.client?.name || "Non associé à un client"}{selected.contact?.email ? ` · ${selected.contact.email}` : ""}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => run(async () => { await updateEmailThread(selected.id, { status: selected.status === "OPEN" ? "CLOSED" : "OPEN" }); await loadInbox(); router.refresh() })}>{selected.status === "OPEN" ? <Archive /> : <MailOpen />}{selected.status === "OPEN" ? "Clore" : "Rouvrir"}</Button><Button size="sm" onClick={() => void prepareReply()}><Reply />Répondre</Button><Button size="sm" onClick={() => void prepareReply(true)}><Reply />Répondre à tous</Button></div></div>
            <div className="max-h-[530px] space-y-4 overflow-y-auto bg-muted/20 p-5">{hasPreviousMessages ? <Button variant="outline" size="sm" disabled={isPending} onClick={loadPreviousMessages}>Messages précédents</Button> : null}{selectedMessages.map((message) => <article key={message.id} className={cn("rounded-xl border bg-white p-4 shadow-sm", message.direction === "OUTBOUND" && "ml-auto max-w-[92%] border-primary/20")}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{message.direction === "OUTBOUND" ? initialData.company.name : message.fromAddress}</p><Badge variant="outline">{message.direction === "OUTBOUND" ? "Sortant" : "Entrant"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">À : {recipients(message.toAddresses)}</p></div><time className="text-xs text-muted-foreground">{formatDate(message.sentAt || message.receivedAt || message.createdAt)}</time></div>
              <p className="mt-3 text-sm font-medium">{message.subject}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.bodyText || message.bodyHtml?.replace(/<[^>]+>/g, " ") || "Aucun contenu texte"}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"><Button variant="ghost" size="sm" onClick={() => setPreviewMessage(message)}><Eye />Aperçu HTML</Button><Button variant="ghost" size="sm" disabled={isPending} onClick={() => void prepareForward(message.id)}><Forward />Transférer</Button><Badge variant={message.status === "BOUNCED" || message.status === "FAILED" ? "destructive" : "secondary"}>{["DELIVERED", "OPENED", "CLICKED"].includes(message.status) ? <CheckCircle2 /> : null}{statusLabels[message.status] ?? message.status}</Badge>{message.events.slice(-4).map((event) => <span key={event.id} title={formatDate(event.occurredAt)} className="text-[11px] text-muted-foreground">{eventLabels[event.type] ?? event.type}</span>)}</div>
            </article>)}</div>
          </> : <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">Sélectionnez une conversation.</div>}</div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="compose">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
          <Card className="workspace-panel"><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Nouvel e-mail</CardTitle><HelpTip label="Conseils de rédaction">Gardez un objet court, un seul appel à l’action et vérifiez l’aperçu avant l’envoi. Les variables et séquences marketing se gèrent dans Automatisations.</HelpTip></div><CardDescription>L’envoi sera automatiquement rattaché au client et suivi dans la boîte de réception.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => { event.preventDefault(); run(submitEmail) }}><fieldset disabled={isPending} className="space-y-4"><fieldset disabled={Boolean(draft?.scheduledAt)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="email-sender">Expéditeur</Label><select id="email-sender" name="channelId" value={channelId} onChange={(event) => setChannelId(event.target.value)} required className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm"><option value="">Connecter une messagerie…</option>{activeChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName || channel.emailAddress} · {channel.provider === "GOOGLE" ? "Google" : channel.provider === "MICROSOFT" ? "Microsoft" : "Resend"}</option>)}</select></div><RecipientPicker initialPage={initialData.recipients} value={contactId} onChange={setRecipient} /></div>
            <div className="space-y-1.5"><Label htmlFor="email-cc">CC</Label><Input id="email-cc" value={cc} onChange={event => setCc(event.target.value)} maxLength={5100} placeholder="Adresses séparées par une virgule" /></div>
            <div className="space-y-1.5"><Label htmlFor="email-bcc">CCI</Label><Input id="email-bcc" value={bcc} onChange={event => setBcc(event.target.value)} maxLength={5100} placeholder="Adresses cachées, séparées par une virgule" /></div>
            <div className="space-y-1.5"><Label htmlFor="email-subject">Objet</Label><Input id="email-subject" name="subject" autoComplete="off" value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={2} maxLength={180} /></div>
            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor="email-html">Contenu HTML</Label><span className="text-xs text-muted-foreground">Balises simples autorisées</span></div><Textarea id="email-html" name="bodyHtml" value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} rows={14} required minLength={10} maxLength={100000} className="font-mono text-xs" /></div>
            <SignatureEditor key={`${initialData.company.id}:${initialData.signatureOwnerId}`} initialValue={initialData.signature} onInsert={text => setBodyHtml(insertEmailSignature(bodyHtml, text))} />
            <div className="space-y-2">
              <input ref={attachmentInput} type="file" accept="application/pdf,image/png,image/jpeg" aria-label="Choisir une pièce jointe" className="hidden" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = ""
                if (!file) return
                if (file.size > MAX_EMAIL_FILE_BYTES) { toast.error("5 Mo maximum par fichier"); return }
                run(async () => { try { const saved = await draftForMutation(); restoreDraft(await uploadEmailAttachment(saved, file), true) } catch (error) { setDraftNotice(error instanceof Error ? error.message : "Pièce non enregistrée ; rouvrez le brouillon"); throw error } })
              }} />
              <Button demoMutation type="button" variant="outline" disabled={isPending || draft?.attachments.length === 5} onClick={() => attachmentInput.current?.click()}>Joindre un fichier</Button>
              <p className="text-xs text-muted-foreground">PDF, PNG ou JPEG · 5 Mo par fichier · 10 Mo au total · 5 pièces maximum</p>
              {draft?.attachments.length ? <ul className="space-y-1">{draft.attachments.map(file => <li key={file.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{file.name} · {(file.size / 1024).toFixed(1)} Ko</span><Button demoMutation type="button" variant="ghost" size="sm" disabled={isPending} aria-label={`Retirer ${file.name}`} onClick={() => run(async () => { try { const saved = await draftForMutation(); restoreDraft(await removeEmailAttachment(saved, file.id), true) } catch (error) { setDraftNotice(error instanceof Error ? error.message : "Retrait impossible ; rouvrez le brouillon"); throw error } })}>Retirer</Button></li>)}</ul> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="email-scheduled-time">Date et heure d’envoi</Label><Input id="email-scheduled-time" type="datetime-local" value={localDateTime} onChange={event => setLocalDateTime(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="email-scheduled-zone">Fuseau horaire</Label><Input id="email-scheduled-zone" value={scheduleTimezone} maxLength={100} onChange={event => setScheduleTimezone(event.target.value)} placeholder="Europe/Paris" /></div></div>
            </fieldset>
            <p className="text-xs text-muted-foreground" role="status">{isAutosaving || canAutosave ? "Enregistrement en cours" : draftNotice}</p>
            <div className="flex flex-wrap justify-end gap-2"><Button demoMutation type="button" variant="outline" disabled={isPending || Boolean(draft?.scheduledAt)} onClick={() => run(async () => { await persistDraft() })}>Enregistrer le brouillon</Button><Button type="button" variant="outline" onClick={previewComposition}><Eye />Vérifier l’aperçu</Button><Button demoMutation type="button" variant="outline" disabled={isPending || Boolean(draft?.scheduledAt) || !localDateTime || !scheduleTimezone || !channelId || !contactId || subject.trim().length < 2 || bodyHtml.trim().length < 10} onClick={() => run(scheduleComposition)}>Programmer</Button><Button demoMutation type="submit" disabled={isPending || Boolean(draft?.scheduledAt) || !channelId || !contactId || subject.trim().length < 2 || bodyHtml.trim().length < 10}>{isPending ? <Activity className="animate-spin" /> : <Send />}Envoyer maintenant</Button></div>
          </fieldset></form></CardContent></Card>
          <Card className="workspace-panel"><CardHeader><CardTitle className="text-base">Aperçu sécurisé</CardTitle><CardDescription>Les scripts, formulaires et images distantes sont bloqués dans cet aperçu.</CardDescription></CardHeader><CardContent><iframe title="Aperçu du nouvel e-mail" sandbox="" srcDoc={previewDocument(bodyHtml, null)} className="h-[560px] w-full rounded-xl border bg-white" /></CardContent></Card>
        </div>
      </TabsContent>

      <TabsContent value="drafts"><DraftList refreshKey={`${draft?.id || ""}:${draft?.version || ""}`} onOpen={async id => {
        if (!await mayReplaceComposition()) return
        run(async () => { try { restoreDraft(await getCommunicationDraft(id)); handleTabChange("compose") } finally { pauseAutosave(false) } })
      }} onCancel={cancelSchedule} onDelete={async listed => {
        pauseAutosave(true)
        try {
          await autosaveJob.current
          const version = draftRef.current?.id === listed.id ? draftRef.current.version : listed.version
          const result = await deleteCommunicationDraft({ id: listed.id, version })
          if (!result.success) throw new Error(result.error)
          if (draftRef.current?.id === listed.id) {
            setBaselineSnapshot(JSON.stringify({ ...JSON.parse(latestSnapshot.current), attachmentIds: [] }))
            setDraft(null); createDraftKey.current = null; setSavedSnapshot(""); setFailedSnapshot(""); setAutosaveBlocked(false)
            setDraftNotice("Brouillon supprimé ; texte conservé dans le formulaire")
          }
        } finally { pauseAutosave(false) }
      }} /></TabsContent>

      <TabsContent value="analytics" className="space-y-5">
        <section aria-label="Indicateurs des communications" className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card xl:grid-cols-4">
          <Metric icon={Send} label="E-mails envoyés" value={initialData.stats.sent} hint="30 derniers jours" />
          <Metric icon={Inbox} label="E-mails reçus" value={initialData.stats.received} hint="30 derniers jours" />
          <Metric icon={MailOpen} label="Taux d’ouverture" value={delivered ? `${Math.round(opened / delivered * 100)} %` : "—"} hint={`${opened} ouverture(s) mesurée(s)`} />
          <Metric icon={MousePointerClick} label="Taux de clic" value={delivered ? `${Math.round(clicked / delivered * 100)} %` : "—"} hint={`${bounced} rejet(s)`} />
        </section>
        <Card className="workspace-panel"><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Performance sur 30 jours</CardTitle><HelpTip label="Comprendre les statistiques">Une ouverture peut être déclenchée par les protections de messagerie. Les clics et réponses restent généralement plus fiables pour mesurer l’intérêt.</HelpTip></div><CardDescription>Mesures issues des événements signés du fournisseur d’envoi.</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2"><FunnelRow label="Envoyés" value={initialData.stats.sent} total={Math.max(initialData.stats.sent, 1)} icon={Send} /><FunnelRow label="Livrés" value={delivered} total={Math.max(initialData.stats.sent, 1)} icon={MailCheck} /><FunnelRow label="Ouverts" value={opened} total={Math.max(delivered, 1)} icon={MailOpen} /><FunnelRow label="Cliqués" value={clicked} total={Math.max(delivered, 1)} icon={MousePointerClick} /><FunnelRow label="Rejetés" value={bounced} total={Math.max(initialData.stats.sent, 1)} icon={XCircle} /></CardContent></Card>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><Info className="mr-2 inline size-4" />Conseil : surveillez surtout les rejets et plaintes, puis comparez les réponses et clics entre modèles. Un taux d’ouverture seul ne suffit pas à juger une campagne.</div>
      </TabsContent>

      <TabsContent value="integrations" className="space-y-5">
        <div className="rounded-xl border border-border bg-muted/25 p-4"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Vos accès restent sous votre contrôle</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Resend accepte une clé dédiée fournie par l’entreprise. Google et Microsoft utilisent une autorisation OAuth : le mot de passe n’est jamais transmis au CRM et les jetons sont chiffrés au repos.</p></div></div></div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ProviderCard name="Resend" provider="RESEND" description="Envoi, réception et statistiques par webhook avec votre propre compte." channels={initialData.channels} onConfigure={() => openIntegration("RESEND")} onDisconnect={disconnectIntegration} onSync={syncIntegration} />
          <ProviderCard name="Google Workspace" provider="GOOGLE" description="Gmail et Google Calendar synchronisés en quelques clics, sans partager le mot de passe." channels={initialData.channels} onConfigure={() => openIntegration("GOOGLE")} onDisconnect={disconnectIntegration} onSync={syncIntegration} />
          <ProviderCard name="Microsoft 365" provider="MICROSOFT" description="Outlook et calendrier Microsoft synchronisés via Graph et OAuth." channels={initialData.channels} onConfigure={() => openIntegration("MICROSOFT")} onDisconnect={disconnectIntegration} onSync={syncIntegration} />
        </div>
      </TabsContent>
    </Tabs>

    <Dialog open={integrationDialogOpen} onOpenChange={setIntegrationDialogOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><KeyRound className="size-4" /></div><DialogTitle>Connecter {integrationProvider === "RESEND" ? "Resend" : integrationProvider === "GOOGLE" ? "Google Workspace" : "Microsoft 365"}</DialogTitle><DialogDescription>{integrationProvider === "RESEND" ? "Utilisez une clé de votre compte et le secret du webhook créé pour ce CRM." : "Déclarez l’adresse attendue, puis autorisez le compte correspondant chez le fournisseur."}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(async () => { const result = await configureCommunicationChannel({ provider: integrationProvider, emailAddress: integrationEmail, displayName: integrationDisplayName, visibility: integrationVisibility, capabilities: integrationCapabilities, sharingAcknowledged: form.get("sharingAcknowledged") === "on", apiKey: form.get("apiKey"), webhookSecret: form.get("webhookSecret") }); if (result.connectPath) { window.location.assign(result.connectPath); return } toast.success("Resend est prêt pour les envois et événements."); setIntegrationDialogOpen(false); router.refresh() }) }}>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="integration-email">Adresse de messagerie</Label><Input id="integration-email" name="emailAddress" type="email" autoComplete="email" spellCheck={false} required value={integrationEmail} onChange={(event) => setIntegrationEmail(event.target.value)} placeholder="contact@votre-domaine.fr" /></div><div className="space-y-1.5"><Label htmlFor="integration-name">Nom d’affichage</Label><Input id="integration-name" name="displayName" autoComplete="organization-title" value={integrationDisplayName} onChange={(event) => setIntegrationDisplayName(event.target.value)} placeholder="Équipe commerciale" /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="integration-visibility">Visibilité</Label><select id="integration-visibility" name="visibility" value={integrationVisibility} onChange={(event) => setIntegrationVisibility(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="PRIVATE">Privée — propriétaire et administrateurs</option><option value="SHARED">Partagée — membres autorisés de la société</option></select></div><div className="space-y-1.5"><Label htmlFor="integration-capabilities">Capacités</Label><select id="integration-capabilities" name="capabilities" value={integrationCapabilities} onChange={(event) => setIntegrationCapabilities(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="MAIL">Mail</option>{integrationProvider !== "RESEND" ? <><option value="CALENDAR">Calendrier</option><option value="BOTH">Mail et calendrier</option></> : null}</select></div></div>
          {integrationVisibility === "SHARED" ? <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" name="sharingAcknowledged" required className="mt-1" />Je confirme que les messages et événements de cette boîte peuvent être partagés avec les membres autorisés et utilisés par les scénarios de la société.</label> : null}
          {integrationProvider === "RESEND" ? <div className="space-y-4 rounded-xl border bg-muted/25 p-4"><div className="space-y-1.5"><Label htmlFor="resend-api-key">Clé API Resend</Label><Input id="resend-api-key" name="apiKey" type="password" autoComplete="off" placeholder="re_••••••••••••" /><p className="text-[11px] leading-5 text-muted-foreground">Laissez vide pour conserver la clé enregistrée. Une clé limitée à l’envoi suffit sans boîte de réception ; l’accès complet est requis pour récupérer les messages entrants.</p></div><div className="space-y-1.5"><Label htmlFor="resend-webhook-secret">Secret de signature webhook</Label><Input id="resend-webhook-secret" name="webhookSecret" type="password" autoComplete="off" placeholder="whsec_••••••••••••" /></div><div className="rounded-lg border bg-background px-3 py-2 text-[11px] leading-5 text-muted-foreground">URL à ajouter au domaine de production : <code className="font-mono text-foreground">/api/webhooks/resend</code></div></div> : <div className="rounded-xl border bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">Vous serez redirigé vers le fournisseur. Le CRM demande uniquement les capacités choisies, avec accès hors ligne pour les synchronisations planifiées. Les jetons restent chiffrés.</div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIntegrationDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={isPending || !integrationEmail}><PlugZap className="size-4" />{integrationProvider === "RESEND" ? "Enregistrer la connexion" : "Continuer avec OAuth"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(previewMessage)} onOpenChange={(open) => { if (!open) setPreviewMessage(null) }}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>{previewMessage?.subject}</DialogTitle><DialogDescription>De {previewMessage?.fromAddress} · à {recipients(previewMessage?.toAddresses)}</DialogDescription></DialogHeader><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]"><iframe title="Aperçu HTML de l’e-mail" sandbox="" srcDoc={previewDocument(previewMessage?.bodyHtml ?? null, previewMessage?.bodyText ?? null)} className="h-[620px] w-full rounded-xl border bg-white" /><aside className="space-y-3 rounded-xl bg-muted/40 p-4"><p className="text-xs font-semibold text-muted-foreground">Chronologie</p>{previewMessage?.events.length ? previewMessage.events.map((event) => <div key={event.id} className="flex gap-2 text-xs"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><span><span className="block font-medium">{eventLabels[event.type] ?? event.type}</span><time className="text-muted-foreground">{formatDate(event.occurredAt)}</time></span></div>) : <p className="text-xs text-muted-foreground">Aucun événement supplémentaire.</p>}</aside></div></DialogContent></Dialog>
    <Dialog open={showComposePreview} onOpenChange={setShowComposePreview}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Aperçu avant envoi</DialogTitle><DialogDescription>{composePreview?.subject || "Sans objet"}</DialogDescription></DialogHeader><Button type="button" variant="outline" aria-pressed={showPlainPreview} onClick={() => setShowPlainPreview(value => !value)}>Version texte</Button>{showPlainPreview ? <pre role="region" aria-label="Version texte de l’e-mail" tabIndex={0} className="h-[620px] overflow-auto whitespace-pre-wrap rounded-xl border p-4 text-sm">{composePreview?.text}</pre> : <iframe title="Aperçu final" sandbox="" srcDoc={previewDocument(composePreview?.html || null, composePreview?.text || null)} className="h-[620px] w-full rounded-xl border bg-white" />}</DialogContent></Dialog>
  </div>
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Mail; label: string; value: number | string; hint: string }) { return <div className="workspace-metric flex min-w-0 items-center gap-3 border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[25px] font-semibold leading-none tabular-nums tracking-tight">{value}</p><p className="mt-1 truncate text-[13px] font-medium">{label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p></div></div> }
function FunnelRow({ label, value, total, icon: Icon }: { label: string; value: number; total: number; icon: typeof Mail }) { const percent = Math.min(100, Math.round(value / total * 100)); return <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-primary" />{label}</span><span className="font-semibold tabular-nums">{value} <span className="text-xs font-normal text-muted-foreground">({percent} %)</span></span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div></div> }
function syncStatusLabel(value: unknown) {
  const status = value && typeof value === "object" && "status" in value ? String(value.status) : ""
  return ({ SYNCED: "À jour", CONTINUING: "Synchronisation à poursuivre", FAILED: "Échec", RECONNECT_REQUIRED: "Reconnexion requise", DISABLED: "Non activé" } as Record<string, string>)[status] || "Non synchronisé"
}

function ProviderCard({ name, provider, description, channels, onConfigure, onDisconnect, onSync }: { name: string; provider: IntegrationProvider; description: string; channels: CommunicationData["channels"]; onConfigure: () => void; onDisconnect: (channelId: string) => Promise<void>; onSync: (channelId: string) => void }) {
  const channel = channels.find((item) => item.provider === provider)
  const ready = channel?.status === "ACTIVE"
  return <Card className="workspace-panel flex min-h-60 flex-col"><CardHeader className="flex-1"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><Settings2 className="size-4" /></span><Badge variant={ready ? "secondary" : "outline"}>{ready ? "Connecté" : channel ? "À terminer" : "Non connecté"}</Badge></div><CardTitle className="mt-3 text-base">{name}</CardTitle><CardDescription className="leading-5">{description}</CardDescription>{channel ? <div className="mt-4 border-t pt-3"><p className="text-xs font-medium">{channel.emailAddress}</p><p className="mt-1 text-[11px] text-muted-foreground">{channel.connectionMode === "BYOK" ? "Clés gérées par votre entreprise" : channel.connectionMode === "OAUTH" ? "Autorisation OAuth chiffrée" : "Configuration à finaliser"}</p>{provider !== "RESEND" ? <><p className="mt-1 text-[11px] text-muted-foreground">Mail : {syncStatusLabel(channel.emailSyncStatus)}</p><p className="mt-1 text-[11px] text-muted-foreground">Calendrier : {syncStatusLabel(channel.calendarSyncStatus)}</p></> : null}{channel.lastSyncAt ? <p className="mt-1 text-[11px] text-muted-foreground">Dernière synchro : {formatDate(channel.lastSyncAt)}</p> : null}{channel.lastError ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{channel.lastError}</p> : null}</div> : null}</CardHeader><CardContent className="flex gap-2 border-t pt-4">{ready && channel && provider !== "RESEND" ? <Button demoMutation type="button" size="sm" className="flex-1" onClick={() => onSync(channel.id)}><RefreshCw className="size-4" />Synchroniser</Button> : <Button type="button" size="sm" variant={ready ? "outline" : "default"} className="flex-1" onClick={onConfigure}>{ready ? "Gérer" : provider === "RESEND" ? "Ajouter mes clés" : "Connecter"}</Button>}{ready && channel && provider !== "RESEND" ? <Button type="button" size="sm" variant="outline" onClick={onConfigure}>Gérer</Button> : null}{ready && channel ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Déconnecter ${name}`} onClick={() => void onDisconnect(channel.id)}><Unplug className="size-4 text-danger" /></Button> : null}</CardContent></Card>
}
