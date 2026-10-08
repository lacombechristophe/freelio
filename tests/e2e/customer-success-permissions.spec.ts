import { expect, test, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })

async function openPortfolio(page: Page, surface: string, role: string) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`success-reader-${role}-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL("**/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/service/customer-success")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  await expect(page.getByText(/Score calculé sur les mesures accessibles/)).toBeVisible()
  const card = page.locator("details").filter({ hasText: `UIQA Success permissions ${surface}` })
  await expect(card).toBeVisible()
  await card.locator("summary").press("Enter")
  await expect(card.getByRole("heading", { name: "Signaux calculés", exact: true })).toBeVisible()
  return card
}

test("Owner retains complete financial signals, history and editing", async ({ page }, info) => {
  const card = await openPortfolio(page, info.project.name, "owner")
  await expect(card.getByLabel("Montant du renouvellement")).toHaveValue("123.45")
  await expect(card.getByLabel("Montant du renouvellement")).toBeEnabled()
  await expect(card.locator("summary").getByText("40", { exact: true })).toBeVisible()
  await expect(card.getByText("+5 depuis le dernier relevé", { exact: true })).toBeVisible()
  const debt = card.getByText("Encours échu", { exact: true }).locator("..")
  await expect(debt).toContainText(new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(10.21))
  await expect(card.getByText(`UIQA Financial health ${info.project.name}`, { exact: true })).toBeVisible()
  await expect(page.getByRole("option", { name: "Encours échu", exact: true })).toHaveCount(1)
})

for (const role of ["technician", "service"]) {
  test(`${role} saves service fields without reading or replacing financial values`, async ({ page }, info) => {
    const card = await openPortfolio(page, info.project.name, role)
    await expect(card.getByText("Accès Finance requis", { exact: true })).toHaveCount(2)
    await expect(card.getByText("Historique global indisponible", { exact: true })).toBeVisible()
    await expect(card.getByLabel("Montant du renouvellement")).toHaveCount(0)
    await expect(card.locator("summary").getByText("100", { exact: true })).toBeVisible()
    await expect(card.getByText(`UIQA Financial health ${info.project.name}`, { exact: true })).toHaveCount(0)
    await expect(page.getByRole("option", { name: "Encours échu", exact: true })).toHaveCount(0)
    const link = await card.getByRole("link", { name: `UIQA Success permissions ${info.project.name}`, exact: true }).getAttribute("href")
    expect(link).toMatch(/^\/dashboard\/clients\//)
    const clientId = link!.split("/").at(-1)!
    const label = `UIQA ${role} follow-up ${info.project.name}`
    await card.getByLabel("Prochaine action du portefeuille").fill(label)
    await card.getByRole("button", { name: "Enregistrer le suivi", exact: true }).click()
    await expect.poll(async () => (await database.client.findUniqueOrThrow({ where: { id: clientId } })).nextActionLabel).toBe(label)
    expect((await database.client.findUniqueOrThrow({ where: { id: clientId } })).renewalAmountCents).toBe(12345)
    await page.reload()
    await expect(card.locator("summary")).toContainText(label)
    await expect(card.locator("summary")).toContainText("Historique global indisponible")
  })
}

test("Viewer reads assigned financial signals without financial editing or a global trend", async ({ page }, info) => {
  const card = await openPortfolio(page, info.project.name, "viewer")
  await expect(card.getByLabel("Montant du renouvellement")).toHaveValue("123.45")
  await expect(card.getByLabel("Montant du renouvellement")).toBeDisabled()
  await expect(card.getByText("Historique global indisponible", { exact: true })).toBeVisible()
  const debt = card.getByText("Encours échu", { exact: true }).locator("..")
  await expect(debt).toContainText(new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(3.21))
  await expect(page.getByRole("option", { name: "Encours échu", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: `Archiver UIQA Financial health ${info.project.name}`, exact: true })).toBeDisabled()
})
