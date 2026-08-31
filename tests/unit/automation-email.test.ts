import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/crypto", () => ({ decrypt: (value: string) => value, encrypt: (value: string) => value }))

import { renderEmailVariables, sanitizeSequenceEmailHtml, sendSequenceEmail } from "@/lib/automations/email"
import { evaluateWorkflowConfiguration, workflowConfigurationSchema } from "@/lib/automations/engine"
import { dueSequenceEnrollmentWhere, enrollableSequenceWhere } from "@/lib/automations/sequences"
import { safeEmailPreviewDocument } from "@/app/dashboard/automatisations/automation-model"

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

    const preview = safeEmailPreviewDocument('<img src=javascript:alert(1) onerror=alert(2)><a href="javascript:alert(3)">piège</a>')
    expect(preview).not.toContain("javascript:")
    expect(preview).not.toContain("onerror")
  })

  it("validates bounded, typed workflow actions", () => {
    expect(workflowConfigurationSchema.parse({
      conditions: { source: "WEBSITE", marketingOptIn: true },
      actions: [{ type: "CREATE_TASK", title: "Rappeler {{contact.firstName}}", delayHours: 24, priority: 2 }],
    }).actions[0]).toMatchObject({ type: "CREATE_TASK", delayHours: 24 })
    expect(() => workflowConfigurationSchema.parse({ actions: [] })).toThrow()
  })

  it("resolves a conditional branch without executing its actions", () => {
    const workflow = {
      conditions: { marketingOptIn: true },
      actions: [{
        type: "CONDITIONAL_BRANCH",
        label: "Projet couverture",
        conditions: { projectTypeContains: "couverture" },
        ifTrue: [{ type: "UPDATE_LEAD_STATUS", status: "QUALIFIED" }],
        ifFalse: [{ type: "CREATE_TASK", title: "Qualifier le besoin", delayHours: 2, priority: 2 }],
      }],
    }
    const lead = { ...context.lead, clientId: null, source: "WEBSITE", status: "NEW", marketingOptIn: true }
    expect(evaluateWorkflowConfiguration(workflow, lead)).toMatchObject({
      matches: true,
      actions: [{ type: "UPDATE_LEAD_STATUS", status: "QUALIFIED" }],
      trace: [{ type: "ROOT", matched: true }, { type: "BRANCH", selected: "TRUE" }],
    })
    expect(evaluateWorkflowConfiguration(workflow, { ...lead, projectType: "Entretien" }).actions).toEqual([
      { type: "CREATE_TASK", title: "Qualifier le besoin", delayHours: 2, priority: 2 },
    ])
  })

  it("evaluates customer health conditions without requiring a lead", () => {
    const workflow = {
      conditions: { healthStatus: "RISK", healthScoreBelow: 49, healthScoreDropAtLeast: 10 },
      actions: [{ type: "CREATE_TASK", title: "Suivre {{client.name}}", delayHours: 2, priority: 1 }],
    }
    expect(evaluateWorkflowConfiguration(workflow, null, { healthStatus: "RISK", healthScore: 42, previousHealthScore: 65 })).toMatchObject({ matches: true, actions: [{ type: "CREATE_TASK" }] })
    expect(evaluateWorkflowConfiguration(workflow, null, { healthStatus: "WATCH", healthScore: 60, previousHealthScore: 65 })).toMatchObject({ matches: false, actions: [] })
  })

  it("scopes manual sequence processing to the authenticated company", () => {
    const now = new Date("2026-08-31T08:00:00.000Z")
    expect(dueSequenceEnrollmentWhere(now, "company-1")).toEqual({
      status: "ACTIVE",
      nextSendAt: { lte: now },
      sequence: { status: "ACTIVE", companyId: "company-1" },
    })
    expect(dueSequenceEnrollmentWhere(now)).toEqual({
      status: "ACTIVE",
      nextSendAt: { lte: now },
      sequence: { status: "ACTIVE" },
    })
    expect(enrollableSequenceWhere("sequence-1", "company-1")).toEqual({ id: "sequence-1", companyId: "company-1", status: "ACTIVE" })
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
    })).resolves.toMatchObject({ providerId: "email-1", subject: "Bonjour Camille", from: "Entreprise & Associés <noreply@example.fr>" })

    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(request.body))
    expect(request.headers["Idempotency-Key"]).toBe("delivery-1")
    expect(body.from).toBe("Entreprise & Associés <noreply@example.fr>")
    expect(body.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/crm\.example\.fr\/api\/public\/consent\/one-click\//)
    expect(body.html).toContain("Se désinscrire")
  })
})
