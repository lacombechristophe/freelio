import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { CampaignContentReportView, type CampaignContentReport } from "@/app/dashboard/campagnes/campaign-content-report"

beforeAll(() => vi.stubGlobal("React", React))
afterAll(() => vi.unstubAllGlobals())
const report: CampaignContentReport = { sequenceId: "fiction", sequenceName: "Fictional sequence", checkedAt: "2026-10-20T12:00:00Z", ok: true, emailSteps: 1, linkCount: 0, errors: 0, warnings: 0, issues: [], issueCount: 0 }
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
})
