import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

test("Operations totals, priority previews and agency failures preserve the open form", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette des indicateurs Opérations exige une SQLite fictive isolée")
  const source = await database.user.findUniqueOrThrow({ where: { email: `purchase-creation-${info.project.name}@example.test` }, select: { passwordHash: true } })
  const company = await database.company.create({ data: { name: "Fictional complete Operations activity", serviceTimezone: "Europe/Paris" } })
  await database.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
  const email = `operations-activity-${info.project.name}-${randomUUID()}@example.test`
  const user = await database.user.create({ data: { companyId: company.id, email, emailVerified: new Date(), passwordHash: source.passwordHash } })
  await database.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
  const client = await database.client.create({ data: { companyId: company.id, name: "Fictional complete activity client" } })
  const agencies = []
  for (const code of ["A", "B"]) {
    const agency = await database.agency.create({ data: { companyId: company.id, code, name: `Fictional activity agency ${code}` } })
    agencies.push(agency)
    await database.customerSite.createMany({ data: Array.from({ length: code === "A" ? 101 : 1 }, (_, index) => ({ companyId: company.id, clientId: client.id, agencyId: agency.id, label: `Fictional ${code} site ${index}`, address1: "Fictional address" })) })
    const site = await database.customerSite.findFirstOrThrow({ where: { companyId: company.id, agencyId: agency.id } })
    await database.project.createMany({ data: Array.from({ length: code === "A" ? 301 : 1 }, (_, index) => ({ companyId: company.id, clientId: client.id, agencyId: agency.id, name: `Fictional ${code} project ${index}` })) })
    if (code === "A") {
      await database.serviceTicket.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: company.id, clientId: client.id, siteId: site.id, number: `CLOSED-${index}`, title: "Closed fictional ticket", description: "Fictional description", status: "CLOSED", priority: "URGENT" })) })
      await database.fieldIntervention.createMany({ data: Array.from({ length: 201 }, () => ({ companyId: company.id, siteId: site.id, title: "Completed fictional intervention", status: "COMPLETED", scheduledStart: new Date("2000-01-01T12:00:00Z") })) })
    }
    await database.serviceTicket.createMany({ data: Array.from({ length: code === "A" ? 2 : 1 }, (_, index) => ({ companyId: company.id, clientId: client.id, siteId: site.id, number: `OPEN-${code}-${index}`, title: `Open fictional ${code} ticket`, description: "Fictional description" })) })
    await database.fieldIntervention.createMany({ data: [
      ...Array.from({ length: code === "A" ? 2 : 1 }, () => ({ companyId: company.id, siteId: site.id, title: `Future fictional ${code} intervention`, scheduledStart: new Date("2099-01-01T12:00:00Z") })),
      { companyId: company.id, siteId: site.id, title: `Due fictional ${code} intervention`, scheduledStart: new Date("2001-01-01T12:00:00Z") },
    ] })
  }
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(email)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/operations?tab=overview&create=1")
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  const metric = (name: string) => page.locator(".workspace-metric").filter({ has: page.getByText(name, { exact: true }) })
  const tickets = page.locator("section").filter({ has: page.getByRole("heading", { name: "File SAV prioritaire", exact: true }) })
  const interventions = page.locator("section").filter({ has: page.getByRole("heading", { name: "Interventions du jour", exact: true }) })
  await expect(metric("SAV ouverts").getByText("3", { exact: true })).toBeVisible()
  await expect(metric("Interventions").getByText("3", { exact: true })).toBeVisible()
  await expect(tickets).toContainText("3 affichés sur 3.")
  await expect(interventions).toContainText("2 affichées sur 2.")
  await expect(tickets.getByText("Open fictional A ticket", { exact: false })).toHaveCount(2)
  await expect(page.locator("article").filter({ has: page.getByText(agencies[0].name, { exact: true }) }).locator("dd").first()).toHaveText("101 / 301")
  const title = page.getByTestId("operation-composer").locator("#title")
  await title.fill("Fictional retained ticket input")
  const selectAgency = async (name: string) => {
    await page.getByRole("combobox", { name: "Filtrer par agence", exact: true }).click()
    await page.getByRole("option", { name, exact: true }).click()
  }
  await selectAgency(agencies[0].name)
  await expect(metric("SAV ouverts").getByText("2", { exact: true })).toBeVisible()
  await expect(metric("Interventions").getByText("2", { exact: true })).toBeVisible()
  await expect(tickets).toContainText("2 affichés sur 2.")
  await page.route("**/dashboard/operations*", route => route.request().method() === "POST" ? route.abort("failed") : route.continue())
  await selectAgency(agencies[1].name)
  await expect(metric("SAV ouverts")).toContainText("Actualisation impossible")
  await expect(metric("SAV ouverts").getByText("—", { exact: true })).toBeVisible()
  await expect(tickets).toContainText("Actualisation impossible")
  await expect(page.getByRole("heading", { name: "Aucune priorité opérationnelle", exact: true })).toHaveCount(0)
  await expect(title).toHaveValue("Fictional retained ticket input")
  await page.unroute("**/dashboard/operations*")
  await tickets.getByRole("button", { name: "Réessayer les indicateurs SAV", exact: true }).click()
  await expect(metric("SAV ouverts").getByText("1", { exact: true })).toBeVisible()
  await expect(metric("Interventions").getByText("1", { exact: true })).toBeVisible()
  await expect(tickets).toContainText("1 affiché sur 1.")
  await expect(title).toHaveValue("Fictional retained ticket input")
  await selectAgency("Toutes les agences")
  await expect(metric("SAV ouverts").getByText("3", { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
