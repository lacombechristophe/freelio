import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })

const kinds = [
  { key: "CUSTOMER_ORDER", label: "Commande client" },
  { key: "STOCK", label: "Mouvement de stock" },
  { key: "INTERVENTION", label: "Intervention" },
] as const

for (const kind of kinds) {
  test(`${kind.label}: complete project choices preserve input through failure and replacement`, async ({ page }, info) => {
    if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Choix Chantier Opérations exige une SQLite fictive isolée")
    const source = await database.user.findUniqueOrThrow({ where: { email: `purchase-creation-${info.project.name}@example.test` }, select: { passwordHash: true } })
    const company = await database.company.create({ data: { name: "Fictional complete project browser choices" } })
    await database.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const email = `operations-project-${kind.key}-${info.project.name}-${randomUUID()}@example.test`
    const user = await database.user.create({ data: { companyId: company.id, email, emailVerified: new Date(), passwordHash: source.passwordHash } })
    const membership = await database.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const agency = await database.agency.create({ data: { companyId: company.id, code: "PROJECT", name: "Fictional project browser agency" } })
    await database.agencyMembership.create({ data: { agencyId: agency.id, membershipId: membership.id } })
    const client = await database.client.create({ data: { companyId: company.id, name: "Fictional project browser client" } })
    const site = await database.customerSite.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, label: "Fictional project browser site", address1: "Fictional browser address" } })
    await database.project.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId: company.id, clientId: client.id, agencyId: agency.id, name: `Project ${String(index).padStart(3, "0")}` })) })
    const last = await database.project.findFirstOrThrow({ where: { companyId: company.id, name: "Project 300" } })
    const replacement = await database.project.findFirstOrThrow({ where: { companyId: company.id, name: "Project 299" } })
    const warehouse = await database.warehouse.create({ data: { companyId: company.id, agencyId: agency.id, name: "Fictional project warehouse", code: "PROJECT" } })
    const product = await database.product.create({ data: { companyId: company.id, sku: "FICTIONAL-PROJECT", label: "Fictional project material", stockTracked: true } })
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(email)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/operations?tab=orders&create=1")
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    const composer = page.getByTestId("operation-composer")
    await composer.getByRole("combobox", { name: "Type d’opération", exact: true }).click()
    await page.getByRole("option", { name: kind.label, exact: true }).click()
    const form = composer.locator("form")
    if (kind.key === "CUSTOMER_ORDER") {
      await form.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill(client.name)
      await expect(form.locator("#clientId option").filter({ hasText: client.name })).toHaveCount(1)
      await form.locator("#clientId").selectOption(client.id)
      await form.locator("#label").fill("Fictional retained order line")
      await form.locator("#quantity").fill("2")
      await form.locator("#unitPrice").fill("12.34")
    } else if (kind.key === "STOCK") {
      await form.locator("#warehouseId").selectOption(warehouse.id)
      await form.getByRole("textbox", { name: "Rechercher un produit", exact: true }).fill(product.sku)
      await expect(form.locator("#productId option").filter({ hasText: product.sku })).toHaveCount(1)
      await form.locator("#productId").selectOption(product.id)
      await form.locator("#type").selectOption("IN")
      await form.locator("#quantity").fill("2")
      await form.locator("#reference").fill("Fictional retained stock reference")
    } else {
      await form.getByRole("textbox", { name: "Rechercher un site à rattacher", exact: true }).fill(site.label)
      await expect(form.locator("#siteId option").filter({ hasText: site.label })).toHaveCount(1)
      await form.locator("#siteId").selectOption(site.id)
      await form.locator("#title").fill("Fictional retained intervention")
      await form.locator("#scheduledStart").fill("2030-06-20T10:00")
      await form.locator("#scheduledEnd").fill("2030-06-20T11:00")
    }
    const selected = form.locator("#projectId"), field = selected.locator("..")
    const search = field.getByRole("textbox", { name: "Rechercher un chantier", exact: true })
    const save = form.getByRole("button", { name: "Enregistrer", exact: true })
    await expect(field.getByRole("status")).toHaveText("301 résultats")
    await field.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(field.getByText("Page 2 sur 13", { exact: true })).toBeVisible()
    await field.getByRole("button", { name: "Page précédente", exact: true }).click()
    await search.fill("Project 300")
    await expect(field.getByRole("status")).toHaveText("1 résultat")
    await selected.selectOption(last.id)
    await search.fill("no matching project")
    await expect(field.getByRole("status")).toHaveText("0 résultats")
    await expect(selected).toHaveValue(last.id)
    await expect(save).toBeEnabled()
    await page.route("**/dashboard/operations*", route => route.request().method() === "POST" ? route.abort("failed") : route.continue())
    await search.fill("fictional project network failure")
    await expect(field.getByRole("alert").filter({ hasText: "Impossible d’actualiser la liste." })).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(selected).toHaveValue(last.id)
    await page.unroute("**/dashboard/operations*")
    await database.project.update({ where: { id: last.id }, data: { status: "COMPLETED" } })
    await search.fill("Project 300")
    await expect(field.getByRole("alert").filter({ hasText: "Le choix n’a pas pu être vérifié." })).toBeVisible()
    await expect(save).toBeDisabled()
    await search.fill("Project 299")
    await expect(selected.locator("option").filter({ hasText: replacement.name })).toHaveCount(1)
    await selected.selectOption(replacement.id)
    await expect(save).toBeEnabled()
    if (kind.key === "CUSTOMER_ORDER") {
      await expect(form.locator("#label")).toHaveValue("Fictional retained order line")
      await expect(form.locator("#unitPrice")).toHaveValue("12.34")
    } else if (kind.key === "STOCK") {
      await expect(form.locator("#reference")).toHaveValue("Fictional retained stock reference")
    } else {
      await expect(form.locator("#title")).toHaveValue("Fictional retained intervention")
      await expect(form.locator("#scheduledStart")).toHaveValue("2030-06-20T10:00")
    }
    await save.click()
    if (kind.key === "CUSTOMER_ORDER") {
      await expect.poll(() => database.customerOrder.count({ where: { companyId: company.id, projectId: replacement.id } })).toBe(1)
    } else if (kind.key === "STOCK") {
      await expect.poll(() => database.stockMovement.count({ where: { companyId: company.id, projectId: replacement.id, quantity: 2, type: "IN" } })).toBe(1)
    } else {
      await expect.poll(() => database.fieldIntervention.count({ where: { companyId: company.id, projectId: replacement.id, title: "Fictional retained intervention" } })).toBe(1)
    }
    expect(errors).toEqual([])
  })
}
