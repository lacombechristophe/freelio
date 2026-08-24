import { createConsentWithdrawalToken } from "@/lib/leads/consent-token"

type EmailContext = {
  company: { id: string; name: string; email: string | null }
  lead: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    projectType: string | null
    city: string | null
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
      return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">`
    })
    .replace(/<\/([a-z][a-z0-9-]*)\s*>/gi, (_tag, rawName: string) => allowed.has(rawName.toLowerCase()) ? `</${rawName.toLowerCase()}>` : "")
}

function appBaseUrl() {
  const configured = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL
  if (!configured && process.env.NODE_ENV === "production") throw new Error("PUBLIC_APP_URL est requis pour les liens de désinscription")
  return (configured || "http://localhost:3000").replace(/\/$/, "")
}

function senderFor(companyName: string) {
  const configured = process.env.EMAIL_FROM?.trim()
  if (!configured || configured.includes("example.invalid")) throw new Error("EMAIL_FROM et RESEND_API_KEY doivent être configurés")
  const address = configured.match(/<([^>]+)>/)?.[1] || configured
  return `${companyName.replace(/[<>\r\n]/g, "")} <${address}>`
}

export async function sendSequenceEmail(input: EmailContext & { subjectTemplate: string; bodyTemplate: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error("RESEND_API_KEY n'est pas configurée")
  if (!input.lead.email) throw new Error("Le prospect n'a pas d'adresse e-mail")

  const token = await createConsentWithdrawalToken({ companyId: input.company.id, leadId: input.lead.id })
  const unsubscribeUrl = `${appBaseUrl()}/consent/withdraw/${token}`
  const oneClickUnsubscribeUrl = `${appBaseUrl()}/api/public/consent/one-click/${token}`
  const subject = renderEmailVariables(input.subjectTemplate, input, false).replace(/[\r\n]+/g, " ").trim()
  const content = sanitizeSequenceEmailHtml(renderEmailVariables(input.bodyTemplate, input, true))
  const html = `<!doctype html><html lang="fr"><body><main>${content}</main><hr><p style="color:#667085;font-size:12px;line-height:1.5">Vous recevez cet e-mail selon vos préférences de communication. <a href="${escapeHtml(unsubscribeUrl)}">Se désinscrire</a>.</p></body></html>`

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      from: senderFor(input.company.name),
      to: [input.lead.email],
      reply_to: input.company.email || undefined,
      subject,
      html,
      headers: { "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  })
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string }
  if (!response.ok || !payload.id) throw new Error(payload.message || `Resend a répondu ${response.status}`)
  return { providerId: payload.id, subject }
}
