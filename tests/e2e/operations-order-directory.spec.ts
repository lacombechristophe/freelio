import { expect, test } from "@playwright/test"

for (const role of ["owner", "viewer"]) {
  test(`Operations directories page and search all rows for ${role}`, async ({ page }, info) => {
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`operations-directory-${role}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/operations?tab=orders")
    await page.getByRole("tab", { name: "Commandes", exact: true }).click()
    const orders = page.getByRole("region", { name: "Commandes client", exact: true })
    const reservations = page.getByRole("region", { name: "Réservations actives", exact: true })
    for (const card of [orders, reservations]) {
      await expect(card.getByText("151 résultats", { exact: true })).toBeVisible()
      await expect(card.getByText("Page 1 sur 7", { exact: true })).toBeVisible()
    }
    const search = orders.getByRole("textbox", { name: "Rechercher une commande" })
    await search.fill("DIRECTORY-150")
    await search.fill("DIRECTORY-000")
    await expect(orders.getByText("1 résultat", { exact: true })).toBeVisible()
    await expect(orders.getByText("DIRECTORY-000", { exact: true })).toBeVisible()
    await expect(orders.getByText("DIRECTORY-150", { exact: true })).toHaveCount(0)
    await expect(reservations.getByText("151 résultats", { exact: true })).toBeVisible()
    await reservations.getByRole("textbox", { name: "Rechercher une réservation" }).fill("DIRECTORY-000")
    await expect(reservations.getByText("1 résultat", { exact: true })).toBeVisible()
    await expect(reservations.getByText(/DIRECTORY-000/)).toBeVisible()
    for (const name of ["Consommer", "Libérer"]) {
      const command = reservations.getByRole("button", { name, exact: true })
      if (role === "owner") await expect(command).toBeEnabled()
      else await expect(command).toHaveCount(0)
    }
    await search.fill("")
    await reservations.getByRole("textbox", { name: "Rechercher une réservation" }).fill("")
    await expect(orders.getByText("151 résultats", { exact: true })).toBeVisible()
    for (let index = 0; index < 6; index++) {
      await orders.getByRole("button", { name: "Page suivante", exact: true }).click()
      await expect(orders.getByText(`Page ${index + 2} sur 7`, { exact: true })).toBeVisible()
    }
    await expect(orders.getByText("DIRECTORY-000", { exact: true })).toBeVisible()
    await expect(orders.getByRole("button", { name: "Page suivante", exact: true })).toBeDisabled()
    await expect(reservations.getByText("Page 1 sur 7", { exact: true })).toBeVisible()
    if (role === "owner") {
      for (let index = 0; index < 6; index++) {
        await reservations.getByRole("button", { name: "Page suivante", exact: true }).click()
        await expect(reservations.getByText(`Page ${index + 2} sur 7`, { exact: true })).toBeVisible()
      }
      await reservations.getByRole("button", { name: "Libérer", exact: true }).click()
      await expect(reservations.getByText("150 résultats", { exact: true })).toBeVisible()
      await expect(reservations.getByText("Page 6 sur 6", { exact: true })).toBeVisible()
      await expect(orders.getByText("Page 7 sur 7", { exact: true })).toBeVisible()
    }
  })
}
