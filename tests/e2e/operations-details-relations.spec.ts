import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"
import { hashPassword } from "../../src/lib/auth/password-core"
import { createOperationsDetailsFixture } from "../helpers/operations-details-fixture"

test("Operations details exclude foreign roots, nested histories and inaccessible agencies", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette des fiches Opérations exige une SQLite fictive isolée")
  const database = new PrismaClient()
  const fixture = await createOperationsDetailsFixture(database)
  try {
    const password = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"
    await database.user.update({ where: { id: fixture.user.id }, data: { emailVerified: new Date(), passwordHash: await hashPassword(password) } })
    await database.saasSubscription.create({ data: { companyId: fixture.companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const before = await fixture.snapshot()
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(fixture.user.email!)
    await page.getByLabel("Mot de passe", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    const routes = [
      { key: "equipments", path: "/dashboard/service/equipements/", heading: "Fictional permitted equipment", other: fixture.otherEquipment.id },
      { key: "interventions", path: "/dashboard/service/interventions/", heading: "Fictional permitted intervention", other: fixture.otherIntervention.id },
      { key: "tickets", path: "/dashboard/service/tickets/", heading: "LOCAL · Fictional permitted ticket", other: fixture.otherTicket.id },
      { key: "purchaseOrders", path: "/dashboard/operations/achats/", heading: "LOCAL", other: fixture.otherPurchase.id },
    ] as const
    for (const role of ["OWNER", "TECHNICIAN"]) {
      await database.membership.update({ where: { id: fixture.member.id }, data: { role } })
      for (const route of routes) {
        const response = await page.goto(route.path + fixture.positive[route.key])
        expect(response?.status()).toBe(200)
        const payload = await response!.text()
        expect(payload).not.toContain("FOREIGN-OPERATIONS-")
        for (const id of fixture.forbiddenIds) expect(payload).not.toContain(id)
        expect(payload).not.toContain(fixture.foreignClient.id)
        expect(payload).not.toContain(fixture.foreignMember.id)
        expect(payload).not.toContain("private-bcc@example.test")
        if (role === "TECHNICIAN") {
          for (const id of [fixture.privateThread.id, fixture.otherIntervention.id, fixture.otherReceipt.id, fixture.otherTicket.id]) expect(payload).not.toContain(id)
        }
        await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible()
        const unavailable = await page.goto(route.path + fixture.negative[route.key])
        const rejectedPayload = await unavailable!.text()
        expect(rejectedPayload).not.toContain("FOREIGN-OPERATIONS-")
        expect(rejectedPayload).not.toContain(fixture.foreignClient.id)
        await expect(page.getByRole("heading", { name: "Cette page n’existe pas.", exact: true })).toBeVisible()
        if (role === "TECHNICIAN") {
          await page.goto(route.path + route.other)
          await expect(page.getByRole("heading", { name: "Cette page n’existe pas.", exact: true })).toBeVisible()
        }
      }
    }
    expect(await fixture.snapshot()).toEqual(before)
    expect(errors).toEqual([])
  } finally {
    await fixture.cleanup()
    await database.$disconnect()
  }
})

test("an intervention made inaccessible after display refuses its state change without losing data", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette des états d'intervention exige une SQLite fictive isolée")
  const database = new PrismaClient()
  const fixture = await createOperationsDetailsFixture(database)
  try {
    const password = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"
    await database.user.update({ where: { id: fixture.user.id }, data: { emailVerified: new Date(), passwordHash: await hashPassword(password) } })
    await database.saasSubscription.create({ data: { companyId: fixture.companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(fixture.user.email!)
    await page.getByLabel("Mot de passe", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    const url = `/dashboard/service/interventions/${fixture.positive.interventions}`
    await page.goto(url)
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    await expect(page.getByRole("heading", { name: "Fictional permitted intervention", exact: true })).toBeVisible()
    await database.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { projectId: fixture.negative.projects } })
    const before = await fixture.snapshot()
    await page.getByRole("button", { name: "Démarrer", exact: true }).click()
    await expect(page.getByText("Intervention introuvable", { exact: true })).toBeVisible()
    expect(await fixture.snapshot()).toEqual(before)
    await expect(page.getByRole("heading", { name: "Fictional permitted intervention", exact: true })).toBeVisible()

    await database.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { projectId: fixture.project.id } })
    await page.goto(url)
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    await page.getByRole("button", { name: "Démarrer", exact: true }).click()
    await expect(page.getByText("Intervention démarrée.", { exact: true })).toBeVisible()
    await expect.poll(async () => (await database.fieldIntervention.findUniqueOrThrow({ where: { id: fixture.positive.interventions } })).status).toBe("IN_PROGRESS")
    expect(errors).toEqual([])
  } finally {
    await fixture.cleanup()
    await database.$disconnect()
  }
})
