import { prepareManualMarketingContent } from "@/lib/communications/marketing-consent"
import { sendEmailThroughChannel, type EmailProviderState, type PreparedEmailProviderState } from "@/lib/communications/email-provider"
import { escapeEmailHtml, sanitizeSequenceEmailHtml } from "@/lib/communications/email-sanitize"
import { assertEmailContentReady } from "@/lib/communications/email-preflight"
import type { EmailTemplateVariable } from "@/lib/communications/email-template-variables"
export { sanitizeSequenceEmailHtml } from "@/lib/communications/email-sanitize"

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

function variables(context: EmailContext) {
  return {
    "{{contact.firstName}}": context.lead.firstName,
    "{{contact.lastName}}": context.lead.lastName,
    "{{contact.email}}": context.lead.email || "",
    "{{lead.projectType}}": context.lead.projectType || "",
    "{{lead.city}}": context.lead.city || "",
    "{{company.name}}": context.company.name,
  } satisfies Record<EmailTemplateVariable, string>
}

export function renderEmailVariables(template: string, context: EmailContext, html = false) {
  const values = variables(context)
  // Recipient values are data: never interpret another template token in them.
  return template.replace(/\{\{[^{}]*\}\}/g, key => {
    const raw = values[key as EmailTemplateVariable]
    return raw === undefined ? key : html ? escapeEmailHtml(raw) : raw
  })
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
  assertEmailContentReady(input.subjectTemplate, input.bodyTemplate)
  const subject = renderEmailVariables(input.subjectTemplate, input, false).replace(/[\r\n]+/g, " ").trim()
  const content = sanitizeSequenceEmailHtml(renderEmailVariables(input.bodyTemplate, input, true))
  assertEmailContentReady(subject, content, false)
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
  assertEmailContentReady(subject, html, false)
  const sent = await sendEmailThroughChannel({ companyId: input.company.id, channelId: input.channelId, companyName: input.company.name, from: input.from, to: input.lead.email, replyTo: input.company.email, subject, html, idempotencyKey: input.idempotencyKey, resume: input.resume, onPrepared: input.onPrepared, beforeDispatch: input.beforeDispatch, headers })
  return { ...sent, subject, html }
}
