const CONTRACT_VARIABLES = new Set([
  "client.name",
  "client.email",
  "entreprise.siret",
  "entreprise.name",
  "contract.title",
  "contract.validFrom",
  "contract.validUntil",
])

const ALLOWED_TAGS = new Set([
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
])

type ContractVariableInput = {
  content: string
  client: {
    name: string
    email?: string | null
  }
  company: {
    name: string
    siret?: string | null
  }
  contract: {
    title: string
    validFrom?: Date | string | null
    validUntil?: Date | string | null
  }
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return ""
  return new Date(value).toLocaleDateString("fr-FR")
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function normalizeContractVariables(html: string) {
  return html.replace(/\{\{([\s\S]*?)\}\}/g, (match, rawContent: string) => {
    const variableName = rawContent.replace(/<[^>]*>/g, "").trim()
    return CONTRACT_VARIABLES.has(variableName) ? `{{${variableName}}}` : match
  })
}

export function sanitizeContractHtml(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>/gi, (tag, rawName: string) => {
      const name = rawName.toLowerCase()
      if (!ALLOWED_TAGS.has(name)) return ""

      const closing = tag.startsWith("</") ? "/" : ""
      return name === "br" ? "<br>" : `<${closing}${name}>`
    })
}

export function compileContractVariables(input: ContractVariableInput) {
  const replacements: Record<string, string> = {
    "{{client.name}}": escapeHtml(input.client.name),
    "{{client.email}}": escapeHtml(input.client.email || ""),
    "{{entreprise.siret}}": escapeHtml(input.company.siret || ""),
    "{{entreprise.name}}": escapeHtml(input.company.name),
    "{{contract.title}}": escapeHtml(input.contract.title),
    "{{contract.validFrom}}": formatDate(input.contract.validFrom),
    "{{contract.validUntil}}": formatDate(input.contract.validUntil),
  }

  let compiled = normalizeContractVariables(input.content)
  for (const [key, value] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(key, value)
  }

  return compiled
}
