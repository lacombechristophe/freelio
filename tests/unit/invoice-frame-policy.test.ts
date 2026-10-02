import { expect, it } from "vitest"
import config from "../../next.config"

it("permits only the authenticated invoice endpoint to be framed by its own origin", async () => {
  const rules = await config.headers!()
  const general = rules.find(rule => rule.source === "/(.*)")!
  const invoice = rules.find(rule => rule.source === "/api/pdf/facture/:id")!
  expect(general.headers.find(header => header.key === "X-Frame-Options")?.value).toBe("DENY")
  expect(invoice.headers.find(header => header.key === "X-Frame-Options")?.value).toBe("SAMEORIGIN")
  expect(invoice.headers.find(header => header.key === "Content-Security-Policy")?.value).toContain("frame-ancestors 'self'")
  expect(rules.indexOf(invoice)).toBeGreaterThan(rules.indexOf(general))
})
