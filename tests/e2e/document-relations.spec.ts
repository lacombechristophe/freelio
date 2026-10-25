import { expect, test } from "@playwright/test"

for (const role of ["owner", "sales", "accounting"]) {
  test(`document references remain scoped for ${role}`, async ({ page }, info) => {
    const surface = info.project.name
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`document-readers-${role}-${surface}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })

    await page.goto(`/dashboard/devis/cdocument${surface}coherent`)
    const dossier = page.locator("#suite-du-dossier")
    await expect(dossier.getByRole("link", { name: /DOCUMENT-ORDER/ })).toBeVisible()
    await expect(dossier.getByRole("link", { name: /DOCUMENT-GENERATED/ })).toBeVisible()
    if (role === "sales") {
      await expect(dossier.getByText(/Accès Finance requis/)).toHaveCount(2)
      await expect(dossier.getByText(/1 facture liée/)).toHaveCount(0)
      const billing = dossier.locator("div.group").filter({ hasText: "Facturation" })
      await expect(billing.getByText(/Prêt|À faire/)).toHaveCount(0)
    } else {
      await expect(dossier.getByText("1 facture liée à la commande.", { exact: true })).toBeVisible()
      await expect(dossier.getByText(/DOCUMENT-ORDER · Facturée/)).toBeVisible()
    }
    await expect(page.getByText(/DOCUMENT-FOREIGN/)).toHaveCount(0)

    await page.goto(`/dashboard/devis/cdocument${surface}masked`)
    await expect(page.locator("#suite-du-dossier").getByText("Référence liée indisponible", { exact: true })).toHaveCount(role === "sales" ? 2 : 3)
    await expect(page.getByRole("button", { name: "Lancer le dossier", exact: true })).toBeDisabled()
    await page.getByRole("button", { name: "Plus d’actions", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: "Préparer le contrat", exact: true })).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(page.getByText(/DOCUMENT-FOREIGN/)).toHaveCount(0)

    await page.goto(`/dashboard/contrats/cdocument${surface}contract`)
    await expect(page.getByText("Référence liée indisponible", { exact: true })).toHaveCount(2)
    await expect(page.getByText(/DOCUMENT-FOREIGN/)).toHaveCount(0)
    await expect(page.getByText("Fictional local agreement.", { exact: true })).toBeVisible()

    if (role !== "sales") {
      await page.goto(`/dashboard/factures/cdocument${surface}invoice`)
      await expect(page.getByText("Facture source : Référence liée indisponible", { exact: true })).toBeVisible()
      await expect(page.getByRole("link", { name: /DOCUMENT-CREDIT/ })).toBeVisible()
      await expect(page.getByText(/DOCUMENT-FOREIGN/)).toHaveCount(0)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
  })
}
