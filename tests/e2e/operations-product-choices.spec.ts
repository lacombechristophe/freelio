import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
const forms = [
  { kind: "equipment", label: "Équipement" }, { kind: "movement", label: "Mouvement de stock" },
  { kind: "transfer", label: "Transfert de stock" }, { kind: "order", label: "Commande client" },
  { kind: "reservation", label: "Réservation de stock" }, { kind: "material", label: "Matériel utilisé en intervention" },
] as const

for (const form of forms) {
  test(`${form.kind}: complete Operations product choice preserves input and recovery`, async ({ page }, info) => {
    if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Produit exige une SQLite fictive isolée")
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message))
    const suffix = `${form.kind}${info.project.name}`, lastId = `copsproductlast${suffix}`, firstId = `copsproductfirst${suffix}`
    const last = await database.product.findUniqueOrThrow({ where: { id: lastId } })
    await page.context().clearCookies(); await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`operations-product-choice-${form.kind}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto(form.kind === "material" ? "/dashboard/operations?tab=planning" : "/dashboard/operations?create=1")
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    if (form.kind === "material") await page.getByRole("button", { name: "Matériel utilisé", exact: true }).click()
    else {
      await page.getByTestId("operation-composer").getByRole("combobox", { name: "Type d’opération", exact: true }).click()
      await page.getByRole("option", { name: form.label, exact: true }).click()
    }
    const container = form.kind === "material" ? page.getByRole("dialog").locator("form") : page.getByTestId("operation-composer").locator("form")
    const productName = form.kind === "material" ? "materialProductId" : "productId"
    const choice = container.locator(`label[for="${productName}"]`).locator("..")
    const search = choice.getByRole("textbox", { name: "Rechercher un produit", exact: true })
    const product = choice.locator("select")
    const save = container.getByRole("button", { name: form.kind === "material" ? "Consommer" : "Enregistrer", exact: true })
    await expect(choice.getByText("501 résultats", { exact: true })).toBeVisible()
    const title = `Fictional kept product ${form.kind} ${info.project.name}`
    const quantityName = form.kind === "material" ? "materialQuantity" : "quantity"
    if (form.kind === "equipment") {
      await container.locator("#siteId").selectOption(`copsproductsite${suffix}`)
      await container.locator("#label").fill(title); await container.locator("#serialNumber").fill("FICTIONAL-SERIAL")
    } else {
      await container.locator(`#${quantityName}`).fill("2")
      if (form.kind === "transfer") {
        await container.locator("#fromWarehouseId").selectOption(`copsproductsource${suffix}`)
        await container.locator("#toWarehouseId").selectOption(`copsproductdestination${suffix}`)
        await container.locator("#reference").fill(title)
      } else if (form.kind === "order") {
        await expect(container.locator(`#clientId option[value="copsproductclient${suffix}"]`)).toHaveCount(1)
        await container.locator("#clientId").selectOption(`copsproductclient${suffix}`)
        await container.locator("#label").fill(title); await container.locator("#unitPrice").fill("123.45")
      } else {
        await container.locator(form.kind === "material" ? "#materialWarehouseId" : "#warehouseId").selectOption(`copsproductsource${suffix}`)
        if (form.kind === "movement") { await container.locator("#type").selectOption("IN"); await container.locator("#reference").fill(title) }
        if (form.kind === "reservation") await container.locator("#projectId").selectOption(`copsproductproject${suffix}`)
      }
    }
    await choice.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(choice.getByText("Page 2 sur 21", { exact: true })).toBeVisible()
    await search.fill("zz-last"); await expect(choice.getByText("1 résultat", { exact: true })).toBeVisible()
    await product.selectOption(lastId); await expect(save).toBeEnabled()
    await search.fill(""); await expect(choice.getByText("501 résultats", { exact: true })).toBeVisible()
    await expect(product).toHaveValue(lastId)
    const actionUrl = form.kind === "material" ? "**/dashboard/operations?tab=planning" : "**/dashboard/operations?create=1"
    await page.route(actionUrl, async route => {
      if (route.request().headers()["next-action"] && route.request().postData()?.includes("FAIL-PRODUCT-CHOICE")) await route.fulfill({ status: 503, body: "Fictional product choice failure" })
      else await route.continue()
    })
    await search.fill("FAIL-PRODUCT-CHOICE")
    await expect(choice.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
    await expect(save).toBeDisabled(); await expect(product).toHaveValue(lastId)
    await page.unroute(actionUrl); await choice.getByRole("button", { name: "Réessayer", exact: true }).click()
    await expect(choice.getByText("0 résultats", { exact: true })).toBeVisible()
    await expect(search).toHaveValue("FAIL-PRODUCT-CHOICE"); await expect(product).toHaveValue(lastId)
    await search.fill("Produit 000"); await expect(choice.getByText("1 résultat", { exact: true })).toBeVisible()
    await product.selectOption(firstId); await expect(save).toBeEnabled()
    await database.product.delete({ where: { id: firstId } })
    await search.fill("dernier"); await expect(choice.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
    await expect(save).toBeDisabled(); await expect(product).toHaveValue(firstId)
    await product.selectOption(lastId); await expect(save).toBeEnabled()
    if (form.kind === "equipment") {
      await expect(container.locator("#label")).toHaveValue(title); await expect(container.locator("#serialNumber")).toHaveValue("FICTIONAL-SERIAL")
      await expect(container.locator("#siteId")).toHaveValue(`copsproductsite${suffix}`)
    } else {
      await expect(container.locator(`#${quantityName}`)).toHaveValue("2")
      if (form.kind === "order") {
        await expect(container.locator("#clientId")).toHaveValue(`copsproductclient${suffix}`)
        await expect(container.locator("#label")).toHaveValue(title); await expect(container.locator("#unitPrice")).toHaveValue("123.45")
      } else if (form.kind === "transfer") {
        await expect(container.locator("#fromWarehouseId")).toHaveValue(`copsproductsource${suffix}`)
        await expect(container.locator("#toWarehouseId")).toHaveValue(`copsproductdestination${suffix}`)
        await expect(container.locator("#reference")).toHaveValue(title)
      } else {
        await expect(container.locator(form.kind === "material" ? "#materialWarehouseId" : "#warehouseId")).toHaveValue(`copsproductsource${suffix}`)
        if (form.kind === "movement") await expect(container.locator("#reference")).toHaveValue(title)
        if (form.kind === "reservation") await expect(container.locator("#projectId")).toHaveValue(`copsproductproject${suffix}`)
      }
    }
    await save.click()
    await expect(page.getByText(form.kind === "material" ? "Matériel consommé et coût réel mis à jour." : `${form.label} enregistré.`, { exact: true })).toBeVisible()
    if (form.kind === "material") await expect(container).toBeHidden()
    else await expect(product).toHaveValue("")
    if (form.kind === "equipment") expect(await database.equipment.findFirst({ where: { companyId: last.companyId, label: title } })).toMatchObject({ productId: lastId, serialNumber: "FICTIONAL-SERIAL" })
    if (form.kind === "movement") expect(await database.stockMovement.findFirst({ where: { companyId: last.companyId, reference: title } })).toMatchObject({ productId: lastId, quantity: 2 })
    if (form.kind === "transfer") expect(await database.stockTransfer.findFirst({ where: { companyId: last.companyId, reference: title } })).toMatchObject({ productId: lastId, quantity: 2, unitCostCents: 789 })
    if (form.kind === "order") expect(await database.customerOrder.findFirst({ where: { companyId: last.companyId }, include: { lines: true } })).toMatchObject({ totalHtCents: 24690, lines: [expect.objectContaining({ productId: lastId, quantity: 2, unitPriceCents: 12345 })] })
    if (form.kind === "reservation") expect(await database.stockReservation.findFirst({ where: { companyId: last.companyId } })).toMatchObject({ productId: lastId, projectId: `copsproductproject${suffix}`, quantity: 2 })
    if (form.kind === "material") expect(await database.stockMovement.findFirst({ where: { companyId: last.companyId, fieldInterventionId: `copsproductintervention${suffix}` } })).toMatchObject({ productId: lastId, quantity: -2, unitCostCents: 789 })
    const inventory = await database.inventoryItem.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId: `copsproductsource${suffix}`, productId: lastId } } })
    expect(inventory.quantity).toBe(form.kind === "movement" ? 102 : ["material", "transfer"].includes(form.kind) ? 98 : 100)
    expect(inventory.reservedQuantity).toBe(form.kind === "reservation" ? 2 : 0)
    expect(await database.emailDelivery.count({ where: { companyId: last.companyId } })).toBe(0)
    expect(errors).toEqual([])
  })
}
