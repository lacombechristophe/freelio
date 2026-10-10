import { expect, test } from "@playwright/test"

for (const role of ["service", "sales", "accounting"]) {
  test(`Organisation document cards respect ${role} permissions`, async ({ page }, info) => {
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`organisation-${role}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    const response = await page.goto("/dashboard/organisation")
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    const invoices = page.locator("section").filter({ has: page.getByRole("heading", { name: "Factures à suivre", exact: true }) })
    const quotes = page.locator("section").filter({ has: page.getByRole("heading", { name: "Devis ouverts", exact: true }) })
    await expect(invoices).toBeVisible()
    await expect(quotes).toBeVisible()
    if (role === "accounting") {
      await expect(invoices.getByRole("link", { name: /ORG-PRIVATE-FINANCE/ })).toBeVisible()
      await expect(page.getByText("1 facture(s) en retard", { exact: true })).toBeVisible()
      await expect(page.getByText("2 point(s)", { exact: true })).toBeVisible()
    } else {
      await expect(invoices.getByText("Accès Finance requis", { exact: true })).toBeVisible()
      await expect(page.getByText("1 point(s)", { exact: true })).toBeVisible()
      expect(html).not.toContain("ORG-PRIVATE-FINANCE")
      await expect(page.getByText(/facture\(s\) en retard/)).toHaveCount(0)
    }
    if (role === "service") {
      await expect(quotes.getByText("Accès commercial requis", { exact: true })).toBeVisible()
      expect(html).not.toContain("ORG-PRIVATE-SALES")
    } else {
      await expect(quotes.getByRole("link", { name: /ORG-PRIVATE-SALES/ })).toBeVisible()
    }
    await expect(page.getByText("Retained blocked task", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Retained operational goal", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Retained operational project", { exact: true }).first()).toBeVisible()
  })
}
