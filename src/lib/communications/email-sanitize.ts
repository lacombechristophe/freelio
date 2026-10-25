export function escapeEmailHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
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
      // Reopened drafts retain their original URL query string after sanitizing.
      const decoded = href.replace(/&(amp|quot|#039|lt|gt);/g, (_, entity: string) => ({ amp: "&", quot: '"', "#039": "'", lt: "<", gt: ">" })[entity]!)
      return `<a href="${escapeEmailHtml(decoded)}" rel="noopener noreferrer">`
    })
    .replace(/<\/([a-z][a-z0-9-]*)\s*>/gi, (_tag, rawName: string) => allowed.has(rawName.toLowerCase()) ? `</${rawName.toLowerCase()}>` : "")
}
