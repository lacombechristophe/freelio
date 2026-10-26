
export function serviceMacroText(html: string) {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .trim()
}

export function renderServiceMacro(value: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((rendered, [name, replacement]) => rendered.replaceAll(`{{${name}}}`, replacement), value)
}
