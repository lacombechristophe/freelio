import { expect, test } from "@playwright/test"

test("une réponse devenue ancienne ne remplace pas la recherche en cours", async ({ page }) => {
  const first = Promise.withResolvers<void>(), second = Promise.withResolvers<void>()
  let firstReady = false, secondReady = false
  await page.goto("/dashboard")
  await page.route("**/dashboard", async route => {
    const request = route.request(), body = request.postData() ?? ""
    if (request.method() !== "POST" || !request.headers()["next-action"] || (!body.includes("Client QA") && !body.includes("Chantier QA"))) return route.continue()
    const response = await route.fetch()
    if (body.includes("Client QA")) { firstReady = true; await first.promise }
    else { secondReady = true; await second.promise }
    await route.fulfill({ response })
  })
  try {
    await page.getByRole("button", { name: "Ouvrir la recherche globale", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Recherche globale", exact: true })
    const input = dialog.getByRole("textbox")
    await input.fill("Client QA")
    await expect.poll(() => firstReady).toBe(true)
    await input.fill("Chantier QA")
    first.resolve()
    await expect.poll(() => secondReady).toBe(true)
    await expect(dialog.getByRole("button", { name: /Client QA Piscine/ })).toHaveCount(0)
    second.resolve()
    await expect(dialog.getByRole("button", { name: /Chantier QA existant/ })).toBeVisible()
  } finally {
    first.resolve(); second.resolve()
  }
})

test("une erreur reste distincte d’une absence de résultat et permet de réessayer", async ({ page }) => {
  let fail = true
  await page.goto("/dashboard")
  await page.route("**/dashboard", route => {
    if (fail && route.request().method() === "POST" && route.request().postData()?.includes("Client QA")) {
      fail = false
      return route.abort("failed")
    }
    return route.continue()
  })
  await page.getByRole("button", { name: "Ouvrir la recherche globale", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Recherche globale", exact: true })
  await dialog.getByRole("textbox").fill("Client QA")
  await expect(dialog.getByRole("alert")).toContainText("La recherche n’a pas abouti")
  await expect(dialog.getByText("Aucun résultat", { exact: true })).toHaveCount(0)
  await expect(dialog.getByRole("textbox")).toHaveValue("Client QA")
  await dialog.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(dialog.getByRole("button", { name: /Client QA Piscine/ })).toBeVisible()
})

test("effacer la recherche invalide la réponse encore en vol", async ({ page }) => {
  const release = Promise.withResolvers<void>()
  let ready = false
  await page.goto("/dashboard")
  await page.route("**/dashboard", async route => {
    if (route.request().method() !== "POST" || !route.request().postData()?.includes("Client QA")) return route.continue()
    const response = await route.fetch()
    ready = true
    await release.promise
    await route.fulfill({ response })
  })
  try {
    await page.getByRole("button", { name: "Ouvrir la recherche globale", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Recherche globale", exact: true })
    await dialog.getByRole("textbox").fill("Client QA")
    await expect.poll(() => ready).toBe(true)
    await dialog.getByRole("textbox").fill("")
    release.resolve()
    await expect(dialog.getByText("Recherchez dans tout l’espace", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: /Client QA Piscine/ })).toHaveCount(0)
  } finally { release.resolve() }
})
