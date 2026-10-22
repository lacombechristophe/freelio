import { expect, test, type Page } from "@playwright/test"

async function login(page: Page, role: string, surface: string) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`communications-${role}-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/communications")
}

for (const role of ["operations", "service"]) {
  test(`${role} can read Communications without automatic writes or editable drafts`, async ({ page }, info) => {
    await login(page, role, info.project.name)
    const posts: string[] = []
    const record = (request: import("@playwright/test").Request) => { if (request.method() === "POST") posts.push(request.url()) }
    page.on("request", record)
    await page.locator("button[data-selected]").filter({ hasText: "UIQA Read-only Communications" }).click()
    await expect(page.getByRole("article").getByText("Fictional retained message", { exact: true })).toBeVisible()
    for (const name of ["Clore", "Répondre", "Répondre à tous", "Transférer"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled()
    expect(posts).toEqual([])
    page.off("request", record)
    await page.reload()
    await expect(page.getByRole("tab", { name: /Boîte de réception/ })).toContainText("1")
    await page.getByRole("tab", { name: "Brouillons", exact: true }).click()
    const draft = page.locator("div.border-b").filter({ has: page.getByText(`UIQA Access private draft ${role.toUpperCase()}`, { exact: true }) })
    await expect(draft.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled()
    await draft.getByRole("button", { name: "Rouvrir", exact: true }).click()
    await expect(page.getByLabel("Objet", { exact: true })).toHaveValue(`UIQA Access private draft ${role.toUpperCase()}`)
    await expect(page.getByLabel("Contenu HTML", { exact: true })).toBeDisabled()
    await page.getByRole("tab", { name: "Boîte de réception", exact: false }).click()
    await expect(page.getByLabel("Recherche", { exact: true })).toBeVisible()
    await page.getByLabel("Recherche", { exact: true }).fill("No matching fictional conversation")
    await page.getByRole("button", { name: "Rechercher", exact: true }).click()
    await expect(page.getByText("Aucune conversation", { exact: true })).toBeVisible()
    await expect(page.getByText("Sélectionnez une conversation.", { exact: true })).toBeVisible()
  })
}

test("Sales can compose but cannot configure a company connection", async ({ page }, info) => {
  await login(page, "sales", info.project.name)
  await page.locator("button[data-selected]").filter({ hasText: "UIQA Read-only Communications" }).click()
  await expect(page.getByRole("button", { name: "Répondre", exact: true })).toBeEnabled()
  await page.getByRole("tab", { name: "Nouvel e-mail", exact: true }).click()
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toBeEditable()
  await page.getByRole("tab", { name: "Intégrations", exact: true }).click()
  await expect(page.getByText(/Droits de gestion de la société requis/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Ajouter mes clés", exact: true })).toBeDisabled()
  for (const button of await page.getByRole("button", { name: "Connecter", exact: true }).all()) await expect(button).toBeDisabled()
})
