import { expect, test } from "@playwright/test"
import { openHostedDemo } from "./demo-entry"

test("the demonstration tour opens three coherent fictitious dossiers", async ({ page, context, baseURL }, info) => {
  const errors: Array<{ route: string; message: string }> = []
  const visited: Array<{ route: string; heading: string | null }> = []
  let demoEntry: Awaited<ReturnType<typeof openHostedDemo>> | undefined
  page.on("pageerror", error => errors.push({ route: new URL(page.url()).pathname, message: error.message }))
  await context.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
  try {
    demoEntry = await openHostedDemo(page, baseURL)

    const tour = page.getByRole("region", { name: "Explorer trois dossiers fictifs", exact: true })
    await expect(tour).toBeVisible()
    await expect(tour.getByRole("link")).toHaveCount(3)
    const paths = await tour.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")!))
    const titles = [
      "Volet de sécurité — visite et devis fictifs",
      "Filtration — chantier de démonstration",
      "Baisse de débit — diagnostic fictif",
    ]
    for (const [index, path] of paths.entries()) {
      expect(new URL(path, baseURL).origin).toBe(baseURL)
      expect((await page.goto(path))?.status()).toBe(200)
      const main = page.locator("#dashboard-main")
      const heading = main.getByRole("heading", { level: 1 })
      await expect(heading).toBeVisible()
      await expect(main).toContainText(titles[index])
      await expect(main).not.toContainText(/Impossible de charger cette page|Une erreur inattendue|Introuvable|introuvable/)
      await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      visited.push({ route: new URL(page.url()).pathname, heading: await heading.textContent() })
    }
    expect(errors).toEqual([])
  } finally {
    await info.attach("synthetic-dossiers-summary", {
      body: JSON.stringify({ project: info.project.name, demoEntry, visited, pageErrors: errors, writesRequested: false }, null, 2),
      contentType: "application/json",
    })
  }
})
