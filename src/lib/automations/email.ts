import { prepareManualMarketingContent } from "@/lib/communications/marketing-consent"
import { sendEmailThroughChannel, type EmailProviderState, type PreparedEmailProviderState } from "@/lib/communications/email-provider"

type EmailContext = {
  company: { id: string; name: string; email: string | null }
  lead: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    projectType: string | null
    city: string | null
    contactId?: string | null
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function variables(context: EmailContext) {
  return {
    "{{contact.firstName}}": context.lead.firstName,
    "{{contact.lastName}}": context.lead.lastName,
    "{{contact.email}}": context.lead.email || "",
    "{{lead.projectType}}": context.lead.projectType || "",
    "{{lead.city}}": context.lead.city || "",
    "{{company.name}}": context.company.name,
  }
}

export function renderEmailVariables(template: string, context: EmailContext, html = false) {
  let rendered = template
  for (const [key, raw] of Object.entries(variables(context))) {
    rendered = rendered.replaceAll(key, html ? escapeHtml(raw) : raw)
  }
  return rendered
}

export function sanitizeSequenceEmailHtml(html: string) {
  const allowed = new Set(["a", "blockquote", "br", "em", "h1", "h2", "h3", "li", "ol", "p", "strong", "ul"])
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|form)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<([a-z][a-z0-9-]*)([^>]*)>/gi, (tag, rawName: string, attributes: string) => {
      const name = rawName.toLowerCase()
      if (!allowed.has(name)) return ""
      if (name === "br") return "<br>"
      if (name !== "a") return `<${name}>`
      const href = attributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
      if (!href || !/^https?:\/\//i.test(href)) return "<a>"
      // A reopened draft is sanitized again. Preserve already escaped URLs
      // rather than changing their query string at each save or send.
      const decoded = href.replace(/&(amp|quot|#039|lt|gt);/g, (_, entity: string) => ({ amp: "&", quot: '"', "#039": "'", lt: "<", gt: ">" })[entity]!)
      return `<a href="${escapeHtml(decoded)}" rel="noopener noreferrer">`
    })
    .replace(/<\/([a-z][a-z0-9-]*)\s*>/gi, (_tag, rawName: string) => allowed.has(rawName.toLowerCase()) ? `</${rawName.toLowerCase()}>` : "")
}

export function senderFor(companyName: string) {
  const configured = process.env.EMAIL_FROM?.trim()
  if (!configured || configured.includes("example.invalid")) throw new Error("EMAIL_FROM et RESEND_API_KEY doivent être configurés")
  const address = configured.match(/<([^>]+)>/)?.[1] || configured
  return `${companyName.replace(/[<>\r\n]/g, "")} <${address}>`
}

export async function prepareSequenceEmail(input: EmailContext & { subjectTemplate: string; bodyTemplate: string }) {
  if (!input.lead.email) throw new Error("Le prospect n'a pas d'adresse e-mail")

  if (!input.lead.contactId) throw new Error("La prospection nécessite un contact avec une preuve liée à son adresse")
  const subject = renderEmailVariables(input.subjectTemplate, input, false).replace(/[\r\n]+/g, " ").trim()
  const content = sanitizeSequenceEmailHtml(renderEmailVariables(input.bodyTemplate, input, true))
  const marketing = await prepareManualMarketingContent(input.company.id, input.lead.contactId, input.lead.email, `<!doctype html><html lang="fr"><body><main>${content}</main></body></html>`)
  return { subject, html: marketing.renderedHtml, headers: marketing.headers, marketing: marketing.authorization }
}

export async function sendSequenceEmail(input: EmailContext & {
  subjectTemplate: string
  bodyTemplate: string
  prepared?: { subject: string; html: string; headers: Record<string, string> }
  from?: string
  idempotencyKey: string
  channelId?: string | null
  resume?: EmailProviderState
  onPrepared?: (state: PreparedEmailProviderState) => Promise<void>
  beforeDispatch?: () => Promise<void>
}) {
  if (!input.lead.email) throw new Error("Le prospect n'a pas d'adresse e-mail")
  const { subject, html, headers } = input.prepared ?? await prepareSequenceEmail(input)
  const sent = await sendEmailThroughChannel({ companyId: input.company.id, channelId: input.channelId, companyName: input.company.name, from: input.from, to: input.lead.email, replyTo: input.company.email, subject, html, idempotencyKey: input.idempotencyKey, resume: input.resume, onPrepared: input.onPrepared, beforeDispatch: input.beforeDispatch, headers })
  return { ...sent, subject, html }
}
