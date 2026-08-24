import { afterEach, describe, expect, it, vi } from "vitest"

import { renderEmailVariables, sanitizeSequenceEmailHtml, sendSequenceEmail } from "@/lib/automations/email"
import { workflowConfigurationSchema } from "@/lib/automations/engine"

const context = {
  company: { id: "company-1", name: "Entreprise & Associés", email: "contact@example.fr" },
  lead: { id: "lead-1", firstName: "Camille", lastName: "Martin", email: "camille@example.fr", projectType: "Couverture <piscine>", city: "Nantes" },
}

describe("email automation", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("renders variables while escaping values inserted into HTML", () => {
    expect(renderEmailVariables("Bonjour {{contact.firstName}} · {{company.name}}", context)).toBe("Bonjour Camille · Entreprise & Associés")
    expect(renderEmailVariables("<p>{{lead.projectType}}</p>", context, true)).toBe("<p>Couverture &lt;piscine&gt;</p>")
  })

  it("removes executable markup and unsafe links", () => {
    const sanitized = sanitizeSequenceEmailHtml('<p onclick="steal()">Bonjour</p><script>alert(1)</script><a href="javascript:alert(1)">piège</a><a href="https://example.fr">ok</a>')
    expect(sanitized).not.toContain("script")
    expect(sanitized).not.toContain("onclick")
    expect(sanitized).not.toContain("javascript:")
    expect(sanitized).toContain('href="https://example.fr"')
  })

  it("validates bounded, typed workflow actions", () => {
    expect(workflowConfigurationSchema.parse({
      conditions: { source: "WEBSITE", marketingOptIn: true },
      actions: [{ type: "CREATE_TASK", title: "Rappeler {{contact.firstName}}", delayHours: 24, priority: 2 }],
    }).actions[0]).toMatchObject({ type: "CREATE_TASK", delayHours: 24 })
    expect(() => workflowConfigurationSchema.parse({ actions: [] })).toThrow()
  })

  it("uses the company profile and adds one-click unsubscribe headers", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "CRM <noreply@example.fr>")
    vi.stubEnv("PUBLIC_APP_URL", "https://crm.example.fr")
    vi.stubEnv("CONSENT_TOKEN_SECRET", "test-consent-secret-that-is-long-enough")
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(sendSequenceEmail({
      ...context,
      subjectTemplate: "Bonjour {{contact.firstName}}",
      bodyTemplate: "<p>Votre projet {{lead.projectType}}</p>",
      idempotencyKey: "delivery-1",
    })).resolves.toEqual({ providerId: "email-1", subject: "Bonjour Camille" })

    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(request.body))
    expect(request.headers["Idempotency-Key"]).toBe("delivery-1")
    expect(body.from).toBe("Entreprise & Associés <noreply@example.fr>")
    expect(body.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/crm\.example\.fr\/api\/public\/consent\/one-click\//)
    expect(body.html).toContain("Se désinscrire")
  })
})
