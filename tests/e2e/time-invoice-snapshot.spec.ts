import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

test("A compiled claim refusal rolls back and preserves the form before a successful retry", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("Le conflit SQL navigateur exige la recette SQLite isolée")
  const surface = info.project.name, id = `ctimesnapshot${surface}`, object = `FICTIONAL-SNAPSHOT-COMPILED-${surface}`
  const trigger = `fixture_time_snapshot_${surface}`, errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  const initial = await database.timeEntry.findUniqueOrThrow({ where: { id } })
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`time-snapshot-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/factures/temps-non-facture"))?.status()).toBe(200)
  const checkbox = page.locator("label").filter({ hasText: "FICTIONAL-SNAPSHOT-TIME" }).getByRole("checkbox")
  await checkbox.check()
  await page.getByLabel("Taux horaire HT (€)", { exact: true }).fill("100")
  await page.getByLabel("Échéance", { exact: true }).fill("2030-02-01")
  await page.getByLabel("Objet optionnel", { exact: true }).fill(object)
  await page.getByLabel("Lignes de facture", { exact: true }).selectOption("DETAIL")
  // This guarded SQL fixture forces a claim conflict inside the real action.
  // It is not a concurrent edit or a production database trigger.
  await database.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" AFTER INSERT ON "Invoice" WHEN NEW."object" = '${object}' BEGIN UPDATE "TimeEntry" SET "invoiceId" = NEW."id" WHERE "id" = '${id}'; END`)
  try {
    await page.getByRole("button", { name: "Créer la facture brouillon", exact: true }).click()
    await expect(page.getByText("Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez.", { exact: true })).toBeVisible()
    await expect(checkbox).toBeChecked()
    await expect(page.getByLabel("Taux horaire HT (€)", { exact: true })).toHaveValue("100")
    await expect(page.getByLabel("Échéance", { exact: true })).toHaveValue("2030-02-01")
    await expect(page.getByLabel("Objet optionnel", { exact: true })).toHaveValue(object)
    await expect(page.getByLabel("Lignes de facture", { exact: true })).toHaveValue("DETAIL")
    expect(await database.timeEntry.findUniqueOrThrow({ where: { id } })).toEqual(initial)
    expect(await database.invoice.count({ where: { object } })).toBe(0)
  } finally { await database.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}"`) }
  await page.getByRole("button", { name: "Créer la facture brouillon", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/factures\/c[a-z0-9]+$/.test(url.pathname), { timeout: 60_000 })
  const invoiceId = new URL(page.url()).pathname.split("/").at(-1)!
  expect(await database.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({ status: "DRAFT", object, totalHtCents: 10000 })
  expect(await database.timeEntry.findUniqueOrThrow({ where: { id } })).toEqual({ ...initial, invoiceId })
  expect(await database.auditLog.count({ where: { resourceId: invoiceId, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(1)
  expect(errors).toEqual([])
})
