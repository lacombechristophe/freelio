import "server-only"
import { toPlainText } from "@react-email/render"
import { sanitizeSequenceEmailHtml } from "./email-sanitize"
import { EMAIL_TEMPLATE_VARIABLES } from "./email-template-variables"

type IssueCode = "EMPTY_SUBJECT" | "LONG_SUBJECT" | "LONG_BODY" | "UNKNOWN_VARIABLE" | "EMPTY_BODY" | "INVALID_LINK" | "LINK_CREDENTIALS" | "HTTP_LINK" | "DYNAMIC_LINK"
export type EmailPreflightIssue = { code: IssueCode; level: "ERROR" | "WARNING"; message: string; field: "subject" | "body"; linkIndex?: number }
const supported = new Set<string>(EMAIL_TEMPLATE_VARIABLES)
const placeholders = /\{\{[^{}]*\}\}/g
const meaningful = (value: string) => value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, "").length > 0

/** Syntax and retained visible content only. Never opens a link or queries DNS. */
export function emailContentPreflight(subject: string, bodyHtml: string, templated = true) {
  const issues: EmailPreflightIssue[] = []
  const add = (code: IssueCode, message: string, field: "subject" | "body", level: "ERROR" | "WARNING" = "ERROR", linkIndex?: number) => issues.push({ code, message, field, level, ...(linkIndex !== undefined ? { linkIndex } : {}) })
  if (!meaningful(subject)) add("EMPTY_SUBJECT", "L’objet est vide.", "subject")
  if (subject.length > 250) add("LONG_SUBJECT", "L’objet dépasse 250 caractères.", "subject")
  const maxBody = templated ? 100_000 : 110_000
  if (bodyHtml.length > maxBody) {
    add("LONG_BODY", `Le contenu dépasse ${maxBody.toLocaleString("fr-FR")} caractères.`, "body")
    return { ok: false, linkCount: 0, issues }
  }
  const retainedHtml = sanitizeSequenceEmailHtml(bodyHtml)
  if (templated) for (const [field, content] of [["subject", subject], ["body", retainedHtml]] as const) {
    if ([...content.matchAll(placeholders)].some(match => !supported.has(match[0]))) add("UNKNOWN_VARIABLE", "Une variable de modèle n’est pas prise en charge.", field)
  }
  const links: Array<string | undefined> = []
  const text = toPlainText(retainedHtml, { wordwrap: false,
    selectors: [{ selector: "a", format: "preflightLink" }],
    formatters: { preflightLink: (
      element: { attribs: Record<string, string>; children: unknown[] },
      walk: (children: unknown[], builder: unknown) => void,
      builder: unknown,
    ) => { links.push(element.attribs.href); walk(element.children, builder) } },
  })
  if (!meaningful(text)) add("EMPTY_BODY", "Le contenu conservé ne contient aucun texte visible.", "body")
  links.forEach((link, index) => {
    const linkIndex = index + 1, dynamic = templated && !!link?.match(placeholders)
    try {
      const url = new URL((link || "").replace(placeholders, variable => supported.has(variable) && templated ? "example" : variable))
      if (!["https:", "http:"].includes(url.protocol) || !url.hostname) throw new Error("INVALID_LINK")
      if (url.username || url.password) add("LINK_CREDENTIALS", `Le lien n°${linkIndex} contient des identifiants dans l’adresse.`, "body", "ERROR", linkIndex)
      if (url.protocol === "http:") add("HTTP_LINK", `Le lien n°${linkIndex} utilise HTTP sans chiffrement.`, "body", "WARNING", linkIndex)
      if (dynamic) add("DYNAMIC_LINK", `Le lien n°${linkIndex} sera revérifié après personnalisation.`, "body", "WARNING", linkIndex)
    } catch { add("INVALID_LINK", `Le lien n°${linkIndex} doit conserver une adresse HTTP ou HTTPS complète.`, "body", "ERROR", linkIndex) }
  })
  return { ok: !issues.some(issue => issue.level === "ERROR"), linkCount: links.length, issues }
}

export class EmailContentPreflightError extends Error {}
export function assertEmailContentReady(subject: string, bodyHtml: string, templated = true) {
  const report = emailContentPreflight(subject, bodyHtml, templated)
  const error = report.issues.find(issue => issue.level === "ERROR")
  if (error) throw new EmailContentPreflightError(error.message)
  return report
}
