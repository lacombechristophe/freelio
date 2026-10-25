import { expect, test } from "@playwright/test"

test("Compiled previews and downloads refuse a foreign document party", async ({ page }, info) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`pdf-scope-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  for (const [kind, route] of [["invoice", "facture"], ["quote", "devis"]]) {
    const coherent = await page.request.get(`/api/pdf/${route}/cpdf${kind}own${info.project.name}?screen=1`)
    expect(coherent.status()).toBe(200)
    const ownHtml = await coherent.text()
    expect(ownHtml).toContain("FICTIONAL-OWN-PREVIEW-PARTY")
    expect(ownHtml).not.toContain("FICTIONAL-FOREIGN-PREVIEW-PARTY")
    for (const query of ["?screen=1", ""]) {
      const response = await page.request.get(`/api/pdf/${route}/cpdf${kind}foreign${info.project.name}${query}`)
      expect(response.status()).toBe(404)
      expect(response.headers()["cache-control"]).toBe("private, no-store")
      const body = await response.text()
      expect(body).not.toContain("FICTIONAL-FOREIGN-PREVIEW-PARTY")
      expect(body).not.toContain("FICTIONAL-PRIVATE-PREVIEW-ADDRESS")
    }
  }
  expect(errors).toEqual([])
})
