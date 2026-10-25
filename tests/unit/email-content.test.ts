import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { prepareManualEmailContent } from "@/lib/communications/email-content"
import { insertEmailSignature } from "@/lib/communications/signature-input"

describe("sanitized composer and plain alternative", () => {
  it("converts accents, entities, lists and links without executable or discarded HTML", () => {
    const content = prepareManualEmailContent('<p onclick="secret()">Bonjour &eacute;quipe&nbsp;&amp; &#233;</p><script>secret()</script><ul><li>Un</li><li>Deux</li></ul><a href="https://example.test/?a=1&amp;b=2">Dossier</a>')
    expect(content.html).not.toContain("secret")
    expect(content.text).toContain("Bonjour équipe\u00a0& é")
    expect(content.text).toContain("Un"); expect(content.text).toContain("Deux")
    expect(content.text).toContain("Dossier [https://example.test/?a=1&b=2]")
    expect(content.text).not.toContain("<p>"); expect(content.text).not.toContain("secret")
  })
  it("inserts literal signature text only on request, escapes markup and preserves the existing body", () => {
    const body = "<p>Original draft</p>"
    expect(insertEmailSignature(body, " ")).toBe(body)
    const inserted = insertEmailSignature(body, 'Équipe <img src=x onerror=alert(1)> & "Fiction"\r\nLigne 2')
    expect(inserted.startsWith(body)).toBe(true)
    expect(inserted).not.toContain("<img")
    expect(inserted).toContain("&lt;img")
    expect(prepareManualEmailContent(inserted).text).toContain('Équipe <img src=x onerror=alert(1)> & "Fiction"\nLigne 2')
    expect(() => insertEmailSignature("x".repeat(99999), "Signature")).toThrow("taille autorisée")
  })
})
