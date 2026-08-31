import type { LucideIcon } from "lucide-react"

export type AutomationData = NonNullable<Awaited<ReturnType<typeof import("@/actions/automations").getAutomationDashboard>>>
export type AutomationSequence = AutomationData["sequences"][number]
export type AutomationTemplate = AutomationData["templates"][number]
export type AutomationWorkflow = AutomationData["workflows"][number]
export type AutomationDelivery = AutomationData["deliveries"][number]

export type AutomationRunner = (
  operation: () => Promise<unknown>,
  successMessage: string,
  options?: { form?: HTMLFormElement; after?: () => void },
) => void

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Active",
  PAUSED: "En pause",
  ARCHIVED: "Archivée",
  COMPLETED: "Terminée",
  STOPPED: "Arrêtée",
  SCHEDULED: "Planifié",
  SENDING: "En cours",
  SENT: "Envoyé",
  DELIVERED: "Livré",
  OPENED: "Ouvert",
  CLICKED: "Cliqué",
  DELAYED: "Retardé",
  BOUNCED: "Rejeté",
  FAILED: "Échec",
  COMPLAINED: "Plainte",
  SUPPRESSED: "Bloqué",
  CANCELED: "Annulé",
  SKIPPED: "Ignorée",
  RUNNING: "En cours",
  PUBLISHED: "Publiée",
  SUPERSEDED: "Remplacée",
}

export const TRIGGER_LABELS: Record<string, string> = {
  LEAD_CREATED: "Prospect créé",
  LEAD_STATUS_CHANGED: "Statut prospect modifié",
  QUOTE_STATUS_CHANGED: "Statut devis modifié",
  EMAIL_RECEIVED: "E-mail reçu",
  EMAIL_OPENED: "E-mail ouvert",
  EMAIL_CLICKED: "Lien d’e-mail cliqué",
  PORTAL_APPOINTMENT_REQUESTED: "Rendez-vous demandé",
  INTERVENTION_COMPLETED: "Intervention terminée",
  CUSTOMER_HEALTH_CHANGED: "Santé client recalculée",
}

export const ACTION_LABELS: Record<string, string> = {
  ENROLL_SEQUENCE: "Inscrire dans une séquence",
  CREATE_TASK: "Créer une tâche",
  NOTIFY_TEAM: "Notifier l’équipe",
  UPDATE_LEAD_STATUS: "Modifier le statut prospect",
  CONDITIONAL_BRANCH: "Branche si/alors",
}

export const STEP_LABELS: Record<string, string> = {
  EMAIL: "E-mail automatique",
  MANUAL_EMAIL: "E-mail manuel",
  CALL_TASK: "Appel",
  GENERAL_TASK: "Tâche",
}

export const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.02)] outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
export const textAreaClass = "min-h-28 w-full resize-y rounded-[10px] border border-input bg-background p-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.02)] outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"

export function formatAutomationDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("fr-FR", options ?? { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

export function plainTextFromHtml(html: string) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function safeEmailPreviewDocument(html: string) {
  const sanitized = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|form|meta|base)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|form|meta|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[\s\S]*?\2/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:javascript|vbscript|data:text\/html)[^\s>]*/gi, "")
  return `<!doctype html><html lang="fr"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;color:#182230;margin:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#0b63f6}</style></head><body>${sanitized}</body></html>`
}

export type NavigationItem = { value: string; label: string; icon: LucideIcon; count?: number }
