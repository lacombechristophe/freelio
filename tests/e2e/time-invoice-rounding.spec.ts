import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
let errors: string[] = []
test.beforeEach(async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La preuve SQL navigateur exige la recette SQLite isolée")
  errors = []; page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`time-rounding-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/factures/temps-non-facture"))?.status()).toBe(200)
})
test.afterEach(() => { expect(errors).toEqual([]) })

for (const [kind, mode, cents, quantity] of [["GROUP", "GROUP_BY_PROJECT", 333, "0,033333"], ["DETAIL", "DETAIL", 334, "0,016667"]] as const) {
  test(`${kind.toLowerCase()} preview and compiled invoice keep the same exact-time total`, async ({ page }, info) => {
    const ids = [1, 2].map(index => `ctimeround${kind.toLowerCase()}${index}${info.project.name}`)
    const initial = await database.timeEntry.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })
    const boxes = page.locator("label").filter({ hasText: `FICTIONAL-ROUND-${kind}` }).getByRole("checkbox")
    await expect(boxes).toHaveCount(2)
    for (let index = 0; index < 2; index++) await boxes.nth(index).check()
    await page.getByLabel("Taux horaire HT (€)", { exact: true }).fill("100")
    await page.getByLabel("Lignes de facture", { exact: true }).selectOption(mode)
    await page.getByLabel("Échéance", { exact: true }).fill("2030-02-01")
    await expect(page.locator("aside").getByText("Total HT", { exact: true }).locator("..")).toContainText(cents === 333 ? "3,33" : "3,34")
    await expect(page.getByText("Les montants sont arrondis au centime par ligne ; le regroupement peut modifier le total.", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Créer la facture brouillon", exact: true }).click()
    await page.waitForURL(url => /^\/dashboard\/factures\/c[a-z0-9]+$/.test(url.pathname), { timeout: 60_000 })
    const invoiceId = new URL(page.url()).pathname.split("/").at(-1)!
    expect(await database.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({ status: "DRAFT", totalHtCents: cents, totalTtcCents: cents })
    expect(await database.timeEntry.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })).toEqual(initial.map(entry => ({ ...entry, invoiceId })))
    const preview = await page.request.get(`/api/pdf/facture/${invoiceId}?screen=1`)
    expect(preview.status()).toBe(200)
    expect(await preview.text()).toContain(`class="num numeric">${quantity}</td>`)
  })
}

test("An out-of-capacity preview preserves the rate and selection and prevents creation", async ({ page }, info) => {
  const id = `ctimeroundoverflow${info.project.name}`, initial = await database.timeEntry.findUniqueOrThrow({ where: { id } })
  const checkbox = page.locator("label").filter({ hasText: "FICTIONAL-ROUND-OVERFLOW" }).getByRole("checkbox")
  await checkbox.check()
  await page.getByLabel("Taux horaire HT (€)", { exact: true }).fill("20000000")
  await expect(page.getByText("Montant indisponible", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Créer la facture brouillon", exact: true })).toBeDisabled()
  await expect(checkbox).toBeChecked()
  await expect(page.getByLabel("Taux horaire HT (€)", { exact: true })).toHaveValue("20000000")
  expect(await database.timeEntry.findUniqueOrThrow({ where: { id } })).toEqual(initial)
  await page.getByLabel("Taux horaire HT (€)", { exact: true }).fill("100")
  await expect(page.getByRole("button", { name: "Créer la facture brouillon", exact: true })).toBeEnabled()
})
