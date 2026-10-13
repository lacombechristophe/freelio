import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
const forms = [
  { kind: "site", label: "Site client", titleId: "label" },
  { kind: "ticket", label: "Ticket SAV", titleId: "title" },
  { kind: "maintenance", label: "Contrat d’entretien", titleId: "label" },
  { kind: "order", label: "Commande client", titleId: "label" },
] as const

for (const form of forms) {
  test(`${form.kind}: complete Operations client choice preserves input and recovery`, async ({ page }, info) => {
    if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Opérations exige une SQLite fictive isolée")
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    const lastId = `copschoicelast${form.kind}${info.project.name}`
    const firstId = `copschoicefirst${form.kind}${info.project.name}`
    const last = await database.client.findUniqueOrThrow({ where: { id: lastId } })
    await page.context().clearCookies(); await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`operations-choice-${form.kind}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/operations?create=1")
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    const composer = page.getByTestId("operation-composer")
    await composer.getByRole("combobox", { name: "Type d’opération", exact: true }).click()
    await page.getByRole("option", { name: form.label, exact: true }).click()
    const container = composer.locator("form")
    const search = container.getByRole("textbox", { name: "Rechercher un client", exact: true })
    const client = container.locator("#clientId")
    const save = container.getByRole("button", { name: "Enregistrer", exact: true })
    await expect(container.getByText("501 résultats", { exact: true })).toBeVisible()
    const title = `Fictional kept Operations ${form.kind} ${info.project.name}`
    await container.locator(`#${form.titleId}`).fill(title)
    if (form.kind === "site") {
      await container.locator("#address1").fill("12 rue fictive")
      await container.locator("#postalCode").fill("75001")
      await container.locator("#city").fill("Paris")
    } else if (form.kind === "ticket") await container.locator("#description").fill("Fictional kept description")
    else if (form.kind === "maintenance") {
      await container.locator("#siteId").selectOption(`copschoicesite${form.kind}${info.project.name}`)
      await container.locator("#startDate").fill("2030-01-02")
      await container.locator("#price").fill("123.45")
    } else {
      await container.locator("#quantity").fill("2")
      await container.locator("#unitPrice").fill("123.45")
    }
    await container.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(container.getByText("Page 2 sur 21", { exact: true })).toBeVisible()
    await search.fill("dernier")
    await expect(container.getByText("1 résultat", { exact: true })).toBeVisible()
    await client.selectOption(lastId); await expect(save).toBeEnabled()
    await search.fill(""); await expect(container.getByText("501 résultats", { exact: true })).toBeVisible()
    await expect(client).toHaveValue(lastId)
    await page.route("**/dashboard/operations?create=1", async route => {
      if (route.request().headers()["next-action"] && route.request().postData()?.includes("FAIL-OPS-CHOICE")) await route.fulfill({ status: 503, body: "Fictional Operations choice failure" })
      else await route.continue()
    })
    await search.fill("FAIL-OPS-CHOICE")
    await expect(container.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
    await expect(save).toBeDisabled(); await expect(client).toHaveValue(lastId)
    await expect(container.locator(`#${form.titleId}`)).toHaveValue(title)
    await page.unroute("**/dashboard/operations?create=1")
    await container.getByRole("button", { name: "Réessayer", exact: true }).click()
    await expect(container.getByText("0 résultats", { exact: true })).toBeVisible()
    await expect(search).toHaveValue("FAIL-OPS-CHOICE"); await expect(client).toHaveValue(lastId)
    await search.fill("Client 000"); await expect(container.getByText("1 résultat", { exact: true })).toBeVisible()
    await client.selectOption(firstId); await expect(save).toBeEnabled()
    await database.client.delete({ where: { id: firstId } })
    await search.fill("dernier"); await expect(container.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
    await expect(save).toBeDisabled(); await expect(client).toHaveValue(firstId)
    await expect(container.locator(`#${form.titleId}`)).toHaveValue(title)
    await client.selectOption(lastId); await expect(save).toBeEnabled()
    if (form.kind === "site") {
      await expect(container.locator("#address1")).toHaveValue("12 rue fictive")
      await expect(container.locator("#postalCode")).toHaveValue("75001"); await expect(container.locator("#city")).toHaveValue("Paris")
    } else if (form.kind === "ticket") await expect(container.locator("#description")).toHaveValue("Fictional kept description")
    else if (form.kind === "maintenance") {
      await expect(container.locator("#startDate")).toHaveValue("2030-01-02")
      await expect(container.locator("#siteId")).toHaveValue(`copschoicesite${form.kind}${info.project.name}`)
      await expect(container.locator("#price")).toHaveValue("123.45")
    } else {
      await expect(container.locator("#quantity")).toHaveValue("2"); await expect(container.locator("#unitPrice")).toHaveValue("123.45")
    }
    await save.click()
    await expect(page.getByText(`${form.label} enregistré.`, { exact: true })).toBeVisible()
    await expect(client).toHaveValue("")
    if (form.kind === "site") expect(await database.customerSite.findFirst({ where: { companyId: last.companyId, label: title } })).toMatchObject({ clientId: lastId, address1: "12 rue fictive", city: "Paris", postalCode: "75001" })
    if (form.kind === "ticket") expect(await database.serviceTicket.findFirst({ where: { companyId: last.companyId, title } })).toMatchObject({ clientId: lastId, description: "Fictional kept description" })
    if (form.kind === "maintenance") expect(await database.maintenanceContract.findFirst({ where: { companyId: last.companyId, label: title } })).toMatchObject({ clientId: lastId, priceCents: 12345, autoInvoice: false })
    if (form.kind === "order") expect(await database.customerOrder.findFirst({ where: { companyId: last.companyId, lines: { some: { label: title } } } })).toMatchObject({ clientId: lastId, totalHtCents: 24690, totalTtcCents: 29628 })
    expect(await database.emailDelivery.count({ where: { companyId: last.companyId } })).toBe(0)
    await expect(container).not.toContainText("FOREIGN-OPERATIONS-CHOICE")
    expect(errors).toEqual([])
  })
}
