import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { CampaignContentReportView, type CampaignContentReport } from "@/app/dashboard/campagnes/campaign-content-report"

beforeAll(() => vi.stubGlobal("React", React))
afterAll(() => vi.unstubAllGlobals())
const report: CampaignContentReport = { sequenceId: "fiction", sequenceName: "Fictional sequence", checkedAt: "2026-10-20T12:00:00Z", ok: true, emailSteps: 1, linkCount: 0, errors: 0, warnings: 0, issues: [], issueCount: 0,
  dispatch: { required: true, ready: false, availableNow: false, state: "QUOTA_NOT_CONFIGURED", message: "Configurez les plafonds internes", quota: null } }
describe("campaign content report initial SSR", () => {
  it("limits a successful result to the inspected content and leaves external checks explicit", () => {
    const html = renderToStaticMarkup(React.createElement(CampaignContentReportView, { report }))
    expect(html).toContain("aucun blocage détecté")
    expect(html).toContain("les quotas fournisseur ne sont pas vérifiés")
    expect(html).toContain("Les liens n’ont pas été ouverts")
    expect(html).not.toContain("CONFORME")
  })
  it("shows blocking corrections and the complete issue count without injecting sequence markup", () => {
    const html = renderToStaticMarkup(React.createElement(CampaignContentReportView, { report: { ...report, sequenceName: "<script>fiction</script>", ok: false, errors: 105, issueCount: 105,
      issues: [{ level: "ERROR", code: "INVALID_LINK", field: "body", position: 0, linkIndex: 1, message: "Lien invalide" }] } }))
    expect(html).toContain("corrections requises"); expect(html).toContain("Bloquant")
    expect(html).toContain("1 premiers résultats sur 105")
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;")
  })
  it("keeps valid content distinct from a blocked sender and explains that no capacity is reserved", () => {
    const html = renderToStaticMarkup(React.createElement(CampaignContentReportView, { report }))
    expect(html).toContain("aucun blocage détecté")
    expect(html).toContain("Envoi : Configurez les plafonds internes")
    expect(html).toContain("Aucun destinataire ni quota n’est réservé")
    expect(html).not.toContain("Plafonds internes · version")
  })
  it("shows full quota usage and UTC windows without claiming that activation is blocked", () => {
    const html = renderToStaticMarkup(React.createElement(CampaignContentReportView, { report: { ...report,
      dispatch: { required: true, ready: true, availableNow: false, state: "QUOTA_WAIT", message: "Plafond atteint ; l’activation reste possible", quota: {
        version: 4, enabled: true, dailyRecipientLimit: 10, minuteRecipientLimit: 2,
        windows: [{ period: "DAY", used: 10, resetAt: "2026-10-21T00:00:00.000Z" }, { period: "MINUTE", used: 2, resetAt: "2026-10-20T12:01:00.000Z" }],
      } } } }))
    expect(html).toContain("l’activation reste possible")
    expect(html).toContain("version 4 · actifs")
    expect(html).toContain("Jour UTC : 10 / 10")
    expect(html).toContain("Minute UTC : 2 / 2")
    expect(html).toContain("21/10/2026 00:00:00 UTC")
    expect(html).toContain("avant chaque envoi")
  })
})
