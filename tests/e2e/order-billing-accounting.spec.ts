import { expect, test } from "@playwright/test"

for (const mode of ["deposit", "balance"]) {
  test(`Accounting creates an order ${mode} draft`, async ({ page }, info) => {
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`accounting-order-${mode}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/operations?tab=orders")
    await page.getByRole("tab", { name: "Commandes", exact: true }).click()
    const orders = page.getByRole("region", { name: "Commandes client", exact: true })
    await expect(orders.getByText("ACCOUNTING-ORDER", { exact: true })).toBeVisible()
    await orders.getByRole("button", { name: mode === "deposit" ? "Facturer l’acompte" : "Facturer le solde", exact: true }).click()
    await page.waitForURL(url => /^\/dashboard\/factures\/[^/]+$/.test(url.pathname))
    await expect(page.getByText("Brouillon", { exact: true }).first()).toBeVisible()
    await expect(page.getByLabel("Montants de la facture").getByText(mode === "deposit" ? /30,00/ : /120,00/).first()).toBeVisible()
    await expect(page.getByText(mode === "deposit" ? "Acompte sur commande ACCOUNTING-ORDER" : "Solde de la commande ACCOUNTING-ORDER", { exact: true }).first()).toBeVisible()
    await page.goto("/dashboard/operations?tab=orders")
    await page.getByRole("tab", { name: "Commandes", exact: true }).click()
    await expect(orders.getByText(mode === "deposit" ? "PARTIALLY_INVOICED" : "INVOICED", { exact: true })).toBeVisible()
    if (mode === "deposit") await expect(orders.getByRole("button", { name: "Facturer l’acompte", exact: true })).toHaveCount(0)
    if (mode === "balance") await expect(orders.getByRole("button", { name: "Facturer le solde", exact: true })).toHaveCount(0)
  })
}
