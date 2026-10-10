import "server-only"
import { toPlainText } from "@react-email/render"
import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"

export function emailPlainText(html: string) {
  return toPlainText(html, { wordwrap: false, selectors: [{ selector: "a", options: { linkBrackets: ["[", "]"] } }] })
}

export function prepareManualEmailContent(bodyHtml: string) {
  const content = sanitizeSequenceEmailHtml(bodyHtml.trim())
  const html = `<!doctype html><html lang="fr"><body><main>${content}</main></body></html>`
  return { html, text: emailPlainText(html) }
}
