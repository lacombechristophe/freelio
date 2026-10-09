import { expect, test } from "@playwright/test"

for (const role of ["owner", "technician", "viewer"]) {
  test(`Operations order billing remains scoped for ${role}`, async ({ page }, info) => {
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`operations-billing-${role}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/operations?tab=orders")
    await page.getByRole("tab", { name: "Commandes", exact: true }).click()
    const orders = page.getByRole("tabpanel", { name: "Commandes", exact: true })
    await expect(orders.getByText("BILLING-OPEN", { exact: true })).toBeVisible()
    await expect(orders.getByText("BILLING-INVOICED", { exact: true })).toBeVisible()
    await expect(orders.getByText(/120,00.*TTC/)).toHaveCount(2)

    if (role === "technician") {
      await expect(orders.getByText("Accès Finance requis", { exact: true })).toHaveCount(2)
      await expect(orders.getByText("INVOICED", { exact: true })).toHaveCount(0)
      await expect(orders.getByText("NOT_INVOICED", { exact: true })).toHaveCount(0)
    } else {
      await expect(orders.getByText("Accès Finance requis", { exact: true })).toHaveCount(0)
      await expect(orders.getByText("INVOICED", { exact: true })).toBeVisible()
      await expect(orders.getByText("NOT_INVOICED", { exact: true })).toBeVisible()
    }
    for (const name of ["Facturer l’acompte", "Facturer le solde"]) {
      const command = orders.getByRole("button", { name, exact: true })
      if (role === "owner") await expect(command).toBeEnabled()
      else await expect(command).toHaveCount(0)
    }
  })
}
