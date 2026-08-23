import { describe, expect, it } from "vitest"
import { compileContractVariables, normalizeContractVariables, sanitizeContractHtml } from "@/lib/contracts/html"

describe("contract HTML helpers", () => {
  it("normalizes linkified merge variables before compilation", () => {
    const html = '<p>Client: {{<a href="http://client.name">client.name</a>}}</p>'

    expect(normalizeContractVariables(html)).toBe("<p>Client: {{client.name}}</p>")
  })

  it("keeps contract formatting while stripping unsafe tags and attributes", () => {
    const html = '<p onclick="alert(1)">Texte <strong>important</strong></p><script>alert(1)</script><a href="https://example.com">lien</a>'

    expect(sanitizeContractHtml(html)).toBe("<p>Texte <strong>important</strong></p>lien")
  })

  it("compiles known contract variables in one shared helper", () => {
    const compiled = compileContractVariables({
      content: "<p>{{client.name}} - {{entreprise.name}} - {{contract.validFrom}}</p>",
      client: { name: "Test Client" },
      company: { name: "Freelio", siret: "12345678900012" },
      contract: { title: "Contrat", validFrom: "2026-07-07T00:00:00.000Z" },
    })

    expect(compiled).toContain("Test Client")
    expect(compiled).toContain("Freelio")
    expect(compiled).toContain("07/07/2026")
  })

  it("escapes variable values before they enter the contract HTML", () => {
    const compiled = compileContractVariables({
      content: "<p>{{client.name}} - {{contract.title}}</p>",
      client: { name: '<strong onclick="alert(1)">Client</strong>' },
      company: { name: "Freelio" },
      contract: { title: "<h2>Injected</h2>" },
    })

    expect(compiled).toContain("&lt;strong")
    expect(compiled).toContain("&lt;h2&gt;Injected&lt;/h2&gt;")
    expect(compiled).not.toContain("<strong")
    expect(compiled).not.toContain("<h2>Injected</h2>")
  })
})
