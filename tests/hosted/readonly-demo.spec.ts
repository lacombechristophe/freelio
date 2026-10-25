import { expect, test } from "@playwright/test"
import { assertHostedModule, hostedModules } from "./page-contract"

test("the hosted fictitious demo renders its modules and refuses writes", async ({ page, context, baseURL }, info) => {
  const errors: Array<{ route: string; message: string }> = []
  const visited: string[] = []
  const failures: Array<{ route: string; message: string }> = []
  page.on("pageerror", error => errors.push({ route: new URL(page.url()).pathname + new URL(page.url()).search, message: error.message }))
  await context.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
  for (const route of ["/api/health/live", "/api/health/ready"]) expect((await context.request.get(route)).status()).toBe(200)
  expect((await context.request.post("/api/public/leads", { data: {} })).status()).toBe(403)
  expect((await context.request.get("/api/automations/process")).status()).toBe(403)
  expect((await context.request.get("/api/integrations/email/oauth/start")).status()).toBe(403)
  expect((await context.request.get("/api/backup/export")).status()).toBe(403)
  expect((await context.request.get("/dashboard/devis/new")).status()).toBe(403)

  await page.goto("/auth/login")
  await expect(page.getByRole("button", { name: "Utiliser un lien de connexion", exact: true })).toBeDisabled()
  await page.getByLabel("Adresse e-mail professionnelle").fill(process.env.HOSTED_DEMO_EMAIL!)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.HOSTED_DEMO_PASSWORD!)
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard")
  await expect(page.getByText("Démonstration en lecture seule — données fictives", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export de réversibilité", exact: true })).toBeDisabled()
  for (const [route, heading, ...tabs] of hostedModules) {
    await test.step(route, async () => {
      try {
        expect((await page.goto(route))?.status()).toBe(200)
        await assertHostedModule(page, heading, tabs[0])
        visited.push(route)
      } catch (error) {
        failures.push({ route, message: (error instanceof Error ? error.message : "Page non qualifiée").slice(0, 2000) })
      }
    })
  }
  for (const [route, document, prefix] of [["devis", "devis", "DEMO-DEV-"], ["factures", "facture", "DEMO-FACT-"]]) {
    await page.goto(`/dashboard/${route}`)
    const link = page.locator(`a[href^="/dashboard/${route}/"]`).filter({ hasText: new RegExp(`^${prefix}`) }).first()
    await expect(link).toBeVisible()
    const id = (await link.getAttribute("href"))!.split("/").pop()
    const response = await context.request.get(`/api/pdf/${document}/${id}`, { timeout: 90_000 })
    expect(response.status()).toBe(200)
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-")
  }
  expect((await context.request.post("/api/files/expense/fake", { data: "forbidden" })).status()).toBe(403)
  await page.goto("/dashboard")
  if (info.project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.getByRole("button", { name: "Ouvrir la navigation", exact: true }).click()
    await page.getByRole("button", { name: "Fermer la navigation", exact: true }).click()
  }
  await page.getByRole("button", { name: "Ouvrir le menu du compte" }).click()
  await page.getByRole("menuitem", { name: "Déconnexion", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/auth/login")
  // Credentials and protection headers are never attached to the report.
  await info.attach("hosted-readonly-summary", { body: JSON.stringify({ project: info.project.name, visited, failures, pageErrors: errors }, null, 2), contentType: "application/json" })
  expect(failures).toEqual([])
  expect(errors).toEqual([])
})
