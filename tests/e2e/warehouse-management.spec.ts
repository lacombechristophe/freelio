import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"
import { hashPassword } from "../../src/lib/auth/password-core"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

test("finds an old warehouse, preserves stale form input, and retires only empty warehouses", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette des dépôts exige une SQLite fictive isolée")
  const database = new PrismaClient()
  const fixture = await createOperationsDashboardFixture(database)
  try {
    const password = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"
    await database.user.update({ where: { id: fixture.user.id }, data: { emailVerified: new Date(), passwordHash: await hashPassword(password) } })
    await database.saasSubscription.create({ data: { companyId: fixture.companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    await database.warehouse.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: fixture.companyId, agencyId: fixture.agency.id,
      code: `UIQA-${index}`, name: `UIQA Warehouse ${String(index).padStart(3, "0")}` })) })
    const warehouse = await database.warehouse.findFirstOrThrow({ where: { companyId: fixture.companyId, code: "UIQA-200" } })
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(fixture.user.email!)
    await page.getByLabel("Mot de passe", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/operations")
    await page.getByRole("link", { name: "Dépôts", exact: true }).click()
    await page.getByRole("textbox", { name: "Rechercher un dépôt", exact: true }).fill("UIQA Warehouse")
    await expect(page.getByText("201 résultats", { exact: true })).toBeVisible()
    for (let index = 0; index < 8; index++) {
      await page.getByRole("button", { name: "Page suivante", exact: true }).click()
      await expect(page.getByText(`Page ${index + 2} sur 9`, { exact: true })).toBeVisible()
    }
    await page.getByRole("article", { name: warehouse.name, exact: true }).getByRole("button", { name: "Modifier", exact: true }).click()
    const edit = page.getByRole("dialog", { name: "Modifier le dépôt", exact: true })
    await edit.getByLabel("Adresse", { exact: true }).fill("Adresse fictive conservée")
    await database.warehouse.update({ where: { id: warehouse.id }, data: { address: "Modification concurrente fictive", updatedAt: new Date(warehouse.updatedAt.getTime() + 10_000) } })
    await edit.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await expect(edit.getByRole("alert")).toContainText("Ce dépôt a changé")
    await expect(edit.getByLabel("Adresse", { exact: true })).toHaveValue("Adresse fictive conservée")
    await edit.getByRole("button", { name: "Annuler", exact: true }).click()
    await page.reload()
    await page.getByRole("textbox", { name: "Rechercher un dépôt", exact: true }).fill(warehouse.code)
    const row = page.getByRole("article", { name: warehouse.name, exact: true })
    await row.getByRole("button", { name: "Modifier", exact: true }).click()
    await edit.getByLabel("Adresse", { exact: true }).fill("Adresse fictive validée")
    await edit.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await expect(edit).not.toBeVisible()
    await expect(row.getByText("Adresse fictive validée", { exact: true })).toBeVisible()
    await row.getByRole("button", { name: "Désactiver", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Désactiver le dépôt", exact: true }).click()
    await expect(row.getByText("Inactif", { exact: true })).toBeVisible()
    await page.getByRole("combobox", { name: "Activité des dépôts", exact: true }).selectOption("INACTIVE")
    await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
    await row.getByRole("button", { name: "Réactiver", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Réactiver le dépôt", exact: true }).click()
    await expect(page.getByText("0 résultats", { exact: true })).toBeVisible()
    await page.getByRole("combobox", { name: "Activité des dépôts", exact: true }).selectOption("ALL")
    await expect(row.getByText("Actif", { exact: true })).toBeVisible()
    await database.inventoryItem.create({ data: { companyId: fixture.companyId, warehouseId: warehouse.id, productId: fixture.goodMovement.productId, quantity: 1 } })
    await row.getByRole("button", { name: "Désactiver", exact: true }).click()
    const confirm = page.getByRole("dialog", { name: "Désactiver ce dépôt ?", exact: true })
    await confirm.getByRole("button", { name: "Désactiver le dépôt", exact: true }).click()
    await expect(confirm.getByRole("alert")).toContainText("contient du stock")
    expect((await database.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })).active).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await database.auditLog.deleteMany({ where: { userId: fixture.user.id } })
    await fixture.cleanup()
    await database.$disconnect()
  }
})
