import { expect, test } from "@playwright/test"

for (const role of ["owner", "accounting", "viewer"]) {
  test(`Expense reads exclude foreign relations for ${role}`, async ({ page }, info) => {
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`expense-relations-${role}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    const response = await page.goto("/dashboard/depenses")
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    for (const marker of ["EXPENSE-FOREIGN-CLIENT", "EXPENSE-FOREIGN-PROJECT", "EXPENSE-PROJECT-FOREIGN-CLIENT"]) {
      expect(html).not.toContain(marker)
      await expect(page.getByText(marker, { exact: true })).toHaveCount(0)
    }
    const row = page.getByRole("row").filter({ hasText: "EXPENSE-ALLOWED" })
    await expect(row).toBeVisible()
    await expect(row).toContainText("12,00")
    if (role === "accounting") {
      await row.getByRole("button", { name: "Ouvrir les actions de la dépense", exact: true }).click()
      await page.getByRole("menuitem", { name: "Marquer comme justifiée", exact: true }).click()
      await expect(row.getByText("Justifié", { exact: true })).toBeVisible()
    }
  })
}
