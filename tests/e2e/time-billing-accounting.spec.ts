import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

test("Accounting creates a draft from an accessible time without changing the time", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La preuve SQL navigateur exige la recette SQLite isolée")
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  const id = `ctimebilling${info.project.name}`
  const initial = await database.timeEntry.findUniqueOrThrow({ where: { id } })
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`time-billing-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/factures/temps-non-facture"))?.status()).toBe(200)
  await page.locator("label").filter({ hasText: "FICTIONAL-ACCOUNTING-TIME" }).getByRole("checkbox").check()
  await page.getByLabel("Taux horaire HT (€)", { exact: true }).fill("100")
  await page.getByLabel("Échéance", { exact: true }).fill("2030-02-01")
  await page.getByRole("button", { name: "Créer la facture brouillon", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/factures\/c[a-z0-9]+$/.test(url.pathname), { timeout: 60_000 })
  const invoiceId = new URL(page.url()).pathname.split("/").at(-1)!
  await page.reload()
  const invoice = await database.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true, client: true } })
  expect(invoice).toMatchObject({ status: "DRAFT", projectId: initial.projectId, totalHtCents: 10000, totalTvaCents: 0 })
  expect(invoice.client.companyId).toBe(invoice.companyId)
  expect(invoice.lines).toHaveLength(1)
  expect(await database.timeEntry.findUniqueOrThrow({ where: { id } })).toEqual({ ...initial, invoiceId })
  expect(await database.auditLog.count({ where: { resourceId: invoiceId, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(1)
  await expect(page.getByText(invoice.number, { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})
