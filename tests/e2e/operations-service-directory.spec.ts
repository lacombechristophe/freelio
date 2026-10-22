import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { expect, test, type Page } from "@playwright/test"
import { calendarPeriods } from "../../src/lib/calendar-days"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
type Kind = "sav" | "planning" | "maintenance"

async function setup(surface: string, kind: Kind, role = "OWNER") {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(surface)) throw new Error("La recette des listes Service Opérations exige une SQLite fictive isolée")
  const source = await database.user.findUniqueOrThrow({ where: { email: `purchase-creation-${surface}@example.test` }, select: { passwordHash: true } })
  const company = await database.company.create({ data: { name: "Fictional complete Operations service", serviceTimezone: "Europe/Paris" } })
  await database.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
  const email = `operations-service-${kind}-${surface}-${randomUUID()}@example.test`
  const user = await database.user.create({ data: { companyId: company.id, email, emailVerified: new Date(), passwordHash: source.passwordHash } })
  const member = await database.membership.create({ data: { companyId: company.id, userId: user.id, role, status: "ACTIVE" } })
  const agency = await database.agency.create({ data: { companyId: company.id, code: "SERVICE", name: "Fictional service agency" } })
  await database.agencyMembership.create({ data: { membershipId: member.id, agencyId: agency.id } })
  const client = await database.client.create({ data: { companyId: company.id, name: "Fictional browser service client" } })
  const site = await database.customerSite.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, label: "Fictional browser service site", address1: "Fictional address" } })
  const title = "Fictional service record 200"
  let id: string
  if (kind === "sav") {
    await database.serviceTicket.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ companyId: company.id, clientId: client.id, siteId: site.id, number: `NORMAL-${index}`, title: `Fictional ticket ${String(index).padStart(3, "0")}`, description: "Fictional description" })) })
    id = (await database.serviceTicket.create({ data: { companyId: company.id, clientId: client.id, siteId: site.id, number: "HIGH-LAST", title, description: "Fictional description", priority: "HIGH" } })).id
  } else if (kind === "planning") {
    await database.fieldIntervention.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ companyId: company.id, siteId: site.id, title: `Historical fictional intervention ${index}`, status: "COMPLETED", scheduledStart: new Date("2000-01-01T12:00:00Z") })) })
    const start = new Date(calendarPeriods(new Date(), "Europe/Paris").weekStart.getTime() + 10 * 3600000)
    id = (await database.fieldIntervention.create({ data: { companyId: company.id, siteId: site.id, assignedMembershipId: member.id, title, scheduledStart: start, scheduledEnd: new Date(start.getTime() + 3600000) } })).id
  } else {
    await database.maintenanceContract.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ companyId: company.id, clientId: client.id, siteId: site.id, number: `OLD-${index}`, label: `Fictional maintenance ${String(index).padStart(3, "0")}`, startDate: new Date("1999-01-01"), endDate: new Date("2000-01-01") })) })
    id = (await database.maintenanceContract.create({ data: { companyId: company.id, clientId: client.id, siteId: site.id, number: "LATEST", label: title, startDate: new Date("2030-01-01"), endDate: new Date("2031-01-01") } })).id
  }
  return { email, companyId: company.id, title, id }
}
async function login(page: Page, email: string, kind: Kind) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(email)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto(`/dashboard/operations?tab=${kind}&create=1`)
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
}

async function maintenancePanel(page: Page, fixture: Awaited<ReturnType<typeof setup>>) {
  await login(page, fixture.email, "maintenance")
  await page.getByRole("textbox", { name: "Rechercher un contrat d’entretien", exact: true }).fill(fixture.title)
  const panel = page.locator("details").filter({ has: page.getByText(fixture.title, { exact: true }) })
  await panel.locator("summary").click()
  return panel
}

for (const entry of [
  { kind: "sav", heading: "Tickets SAV", search: "Rechercher un ticket SAV" },
  { kind: "planning", heading: "Planning terrain", search: "Rechercher une intervention" },
  { kind: "maintenance", heading: "Contrats d’entretien", search: "Rechercher un contrat d’entretien" },
] as const) {
  test(`${entry.heading}: complete paging, filtering, failures and retained input`, async ({ page }, info) => {
    const fixture = await setup(info.project.name, entry.kind)
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await login(page, fixture.email, entry.kind)
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: entry.heading, exact: true }) })
    await expect(section.getByRole("status")).toHaveText("201 résultats")
    await section.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(section.getByText("Page 2 sur 9", { exact: true })).toBeVisible()
    await section.getByRole("button", { name: "Page précédente", exact: true }).click()
    const search = section.getByRole("textbox", { name: entry.search, exact: true })
    await search.fill(fixture.title)
    await expect(section.getByRole("status")).toHaveText("1 résultat")
    await expect(section.getByText(fixture.title, { exact: true })).toBeVisible()
    const creationTitle = page.getByTestId("operation-composer").locator("#title")
    await creationTitle.fill("Fictional retained creation input")
    if (entry.kind === "maintenance") {
      const panel = section.locator("details").filter({ has: page.getByText(fixture.title, { exact: true }) })
      await panel.locator("summary").click()
      await panel.getByLabel("Préavis (jours)").fill("45")
      await panel.getByLabel("Notes de renouvellement").fill("Fictional retained renewal note")
      await search.fill("")
      await expect(section.getByRole("status")).toHaveText("201 résultats")
      await section.getByRole("button", { name: "Page suivante", exact: true }).click()
      await expect(panel.getByLabel("Préavis (jours)")).toHaveValue("45")
      await expect(panel.getByLabel("Notes de renouvellement")).toHaveValue("Fictional retained renewal note")
      await page.route("**/dashboard/operations*", route => route.request().method() === "POST" ? route.abort("failed") : route.continue())
      await search.fill("Fictional failed maintenance query")
      await expect(section.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
      await expect(section.getByRole("status")).toHaveText("Total indisponible")
      await expect(panel.getByLabel("Notes de renouvellement")).toHaveValue("Fictional retained renewal note")
      await page.unroute("**/dashboard/operations*")
      await section.getByRole("button", { name: "Réessayer", exact: true }).click()
      await expect(section.getByRole("status")).toHaveText("0 résultats")
      await expect(panel.getByLabel("Préavis (jours)")).toHaveValue("45")
      await panel.locator("summary").click()
      await expect(section.getByText(fixture.title, { exact: true })).toHaveCount(0)
    } else {
      if (entry.kind === "sav") {
        await section.getByRole("combobox", { name: "État des tickets SAV", exact: true }).selectOption("CLOSED")
        await expect(section.getByRole("status")).toHaveText("0 résultats")
        await section.getByRole("combobox", { name: "État des tickets SAV", exact: true }).selectOption("ALL")
      } else {
        await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Capacité de la semaine", exact: true }) })).toContainText("1 intervention")
        await section.getByRole("combobox", { name: "État des interventions", exact: true }).selectOption("PLANNED")
      }
      await expect(section.getByRole("status")).toHaveText("1 résultat")
      await page.route("**/dashboard/operations*", route => route.request().method() === "POST" ? route.abort("failed") : route.continue())
      await search.fill("Fictional failing query")
      await expect(section.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
      await expect(section.getByRole("status")).toHaveText("Total indisponible")
      await expect(creationTitle).toHaveValue("Fictional retained creation input")
      await page.unroute("**/dashboard/operations*")
      await search.fill(fixture.title)
      await expect(section.getByRole("status")).toHaveText("1 résultat")
      if (entry.kind === "planning") {
        await section.getByRole("button", { name: "Replanifier", exact: true }).click()
        const dialog = page.getByRole("dialog")
        await dialog.getByLabel(/^Début(?: \*)?$/).fill("2030-06-20T10:00")
        await dialog.getByLabel(/^Fin(?: \*)?$/).fill("2030-06-20T09:00")
        await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
        await expect(page.locator("[data-sonner-toast]")).toContainText(/fin|créneau/i)
        await expect(dialog.getByLabel(/^Début(?: \*)?$/)).toHaveValue("2030-06-20T10:00")
        await expect(dialog.getByLabel(/^Fin(?: \*)?$/)).toHaveValue("2030-06-20T09:00")
        await dialog.getByRole("button", { name: "Annuler", exact: true }).click()
      }
    }
    await expect(creationTitle).toHaveValue("Fictional retained creation input")
    expect(errors).toEqual([])
  })
}

test("An Operations reader cannot start, reschedule or attach files to an intervention", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "planning", "VIEWER")
  await login(page, fixture.email, "planning")
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Planning terrain", exact: true }) })
  await section.getByRole("textbox", { name: "Rechercher une intervention", exact: true }).fill(fixture.title)
  await expect(section.getByRole("status")).toHaveText("1 résultat")
  for (const name of ["Replanifier", "Démarrer", "Matériel utilisé"]) await expect(section.getByRole("button", { name, exact: true })).toBeDisabled()
  await expect(section.getByLabel(`Ajouter une pièce à ${fixture.title}`)).toBeDisabled()
})

test("Service saves maintenance renewal settings with one audit and no general operational rights", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance", "SERVICE")
  const panel = await maintenancePanel(page, fixture)
  await panel.getByLabel("Préavis (jours)").fill("45")
  await panel.getByLabel("Notes de renouvellement").fill("Fictional Service renewal agreement")
  await panel.getByRole("button", { name: "Enregistrer le renouvellement", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Paramètres de renouvellement enregistrés.")
  await expect.poll(async () => database.auditLog.count({ where: { resourceId: fixture.id, action: "UPDATE_MAINTENANCE_RENEWAL" } })).toBe(1)
  const saved = await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })
  expect(saved).toMatchObject({ noticeDays: 45, renewalNotes: "Fictional Service renewal agreement" })
})

test("A stale maintenance form keeps its input and does not overwrite a newer decision", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance")
  const panel = await maintenancePanel(page, fixture)
  await panel.getByLabel("Préavis (jours)").fill("45")
  await panel.getByLabel("Notes de renouvellement").fill("Fictional unsaved note to preserve")
  const current = await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })
  const newer = await database.maintenanceContract.update({ where: { id: fixture.id }, data: {
    noticeDays: 90, renewalNotes: "Fictional newer decision", updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
  } })
  await panel.getByRole("button", { name: "Enregistrer le renouvellement", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Ce contrat a changé")
  await expect(panel.getByLabel("Préavis (jours)")).toHaveValue("45")
  await expect(panel.getByLabel("Notes de renouvellement")).toHaveValue("Fictional unsaved note to preserve")
  expect(await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })).toEqual(newer)
  expect(await database.auditLog.count({ where: { resourceId: fixture.id } })).toBe(0)
})

test("Maintenance renewal creates one successor, moves billing and records its audit", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance")
  const source = await database.maintenanceContract.update({ where: { id: fixture.id }, data: { priceCents: 10000, indexationRate: 2, renewalStatus: "ACCEPTED" } })
  const oldBilling = await database.recurringInvoice.create({ data: { companyId: fixture.companyId, clientId: source.clientId,
    maintenanceContractId: source.id, label: "Fictional browser billing", frequency: "ANNUALLY", nextGenDate: new Date("2031-01-02"), template: {} } })
  const panel = await maintenancePanel(page, fixture)
  await panel.getByLabel("Notes de renouvellement").fill("Fictional unsaved renewal condition")
  await expect(panel.getByRole("button", { name: "Créer le nouveau terme", exact: true })).toBeDisabled()
  await expect(panel.getByRole("button", { name: "Créer la proposition", exact: true })).toBeDisabled()
  await expect(panel.getByText("Enregistrez les paramètres modifiés avant de créer une proposition ou un nouveau terme.")).toBeVisible()
  await panel.getByLabel("Notes de renouvellement").fill("")
  await panel.getByRole("button", { name: "Créer le nouveau terme", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Contrat renouvelé et nouveau terme créé.")
  await expect.poll(async () => database.maintenanceContract.count({ where: { renewedFromId: fixture.id } })).toBe(1)
  const successor = await database.maintenanceContract.findFirstOrThrow({ where: { renewedFromId: fixture.id } })
  expect(successor.priceCents).toBe(10200)
  expect((await database.recurringInvoice.findUniqueOrThrow({ where: { id: oldBilling.id } })).isActive).toBe(false)
  expect(await database.recurringInvoice.count({ where: { maintenanceContractId: successor.id, isActive: true } })).toBe(1)
  expect(await database.auditLog.count({ where: { resourceId: successor.id, action: "RENEW_MAINTENANCE_CONTRACT" } })).toBe(1)
})

test("Maintenance renewal rejects a stale billing policy and keeps the open form", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance")
  await database.maintenanceContract.update({ where: { id: fixture.id }, data: { priceCents: 10000, renewalStatus: "ACCEPTED", renewalNotes: "Fictional stored renewal condition" } })
  const panel = await maintenancePanel(page, fixture)
  const company = await database.company.findUniqueOrThrow({ where: { id: fixture.companyId } })
  await database.company.update({ where: { id: company.id }, data: { isTvaApplicable: !company.isTvaApplicable } })
  await panel.getByRole("button", { name: "Créer le nouveau terme", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Le contrat a changé")
  await expect(panel.getByLabel("Notes de renouvellement")).toHaveValue("Fictional stored renewal condition")
  expect(await database.maintenanceContract.count({ where: { renewedFromId: fixture.id } })).toBe(0)
  expect((await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })).status).toBe("ACTIVE")
  expect(await database.auditLog.count({ where: { resourceId: fixture.id } })).toBe(0)
})

test("Maintenance proposal lets Commercial prepare an audited draft with HT prices", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance", "SALES")
  const source = await database.maintenanceContract.update({ where: { id: fixture.id }, data: { priceCents: 10000, indexationRate: 2 } })
  const panel = await maintenancePanel(page, fixture)
  await expect(panel.getByRole("button", { name: "Enregistrer le renouvellement", exact: true })).toBeDisabled()
  await panel.getByRole("button", { name: "Créer la proposition", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/contrats\/[^/]+$/.test(url.pathname))
  const proposal = await database.contract.findFirstOrThrow({ where: { companyId: fixture.companyId, maintenanceContractId: fixture.id } })
  expect(proposal.status).toBe("DRAFT")
  expect(proposal.content).toMatch(/102[^0-9]*00[^<]*HT/)
  expect(proposal.content).not.toContain("TTC")
  const saved = await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })
  expect(saved).toEqual({ ...source, currentRenewalProposalId: proposal.id, updatedAt: saved.updatedAt })
  expect(saved.updatedAt.getTime()).toBeGreaterThan(source.updatedAt.getTime())
  expect(await database.auditLog.count({ where: { resourceId: proposal.id, action: "CREATE_MAINTENANCE_RENEWAL_PROPOSAL" } })).toBe(1)
})

test("Maintenance proposal refuses a stale site label and keeps its form open", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance")
  await database.maintenanceContract.update({ where: { id: fixture.id }, data: { renewalNotes: "Fictional retained proposal condition" } })
  const panel = await maintenancePanel(page, fixture)
  const source = await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })
  await database.customerSite.update({ where: { id: source.siteId }, data: { label: "Fictional renamed browser site" } })
  await panel.getByRole("button", { name: "Créer la proposition", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Le contrat a changé pendant la préparation de la proposition")
  await expect(panel.getByLabel("Notes de renouvellement")).toHaveValue("Fictional retained proposal condition")
  expect(await database.contract.count({ where: { maintenanceContractId: fixture.id } })).toBe(0)
  expect(await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })).toEqual(source)
  expect(await database.auditLog.count({ where: { resourceId: fixture.id } })).toBe(0)
})

test("Main Help Desk searches and pages the complete authorized queue", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "sav")
  await login(page, fixture.email, "sav")
  await page.goto("/dashboard/service/help-desk")
  const navigation = page.getByRole("navigation", { name: "Pagination des tickets", exact: true })
  await expect(navigation).toContainText("201 résultat(s) · Page 1 sur 9")
  const tickets = page.locator('a[href^="/dashboard/service/tickets/"]')
  await expect(tickets).toHaveCount(25)
  await expect(tickets.first()).toContainText(fixture.title)
  await navigation.getByRole("link", { name: "Page suivante", exact: true }).click()
  await expect(navigation).toContainText("Page 2 sur 9")
  const search = page.getByRole("textbox", { name: "Rechercher un ticket", exact: true })
  await search.fill(fixture.title)
  await page.locator("form").filter({ has: search }).getByRole("button", { name: "Rechercher", exact: true }).click()
  await expect(navigation).toContainText("1 résultat(s) · Page 1 sur 1")
  await expect(tickets).toHaveCount(1)
  await expect(tickets.first()).toContainText(fixture.title)
})

test("Main Help Desk retains a responsible choice outside search and uses company time", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "sav")
  const member = await database.membership.findFirstOrThrow({ where: { companyId: fixture.companyId, user: { email: fixture.email } } })
  await database.serviceTicket.update({ where: { id: fixture.id }, data: { assignedMembershipId: member.id, requestedAt: new Date("2030-06-17T08:00:00Z"), dueAt: new Date("2030-06-17T12:00:00Z") } })
  await login(page, fixture.email, "sav")
  await page.goto(`/dashboard/service/help-desk?assignedMembershipId=${member.id}`)
  const search = page.getByRole("textbox", { name: "Rechercher un responsable", exact: true })
  await search.fill("No fictional member match")
  await page.locator("form").filter({ has: search }).getByRole("button", { name: "Rechercher", exact: true }).click()
  await expect(page.getByText(/choix actuel/)).toBeVisible()
  expect(new URL(page.url()).searchParams.get("assignedMembershipId")).toBe(member.id)
  await expect(page.getByText("17 juin 2030, 14:00", { exact: true })).toBeVisible()
  await expect(page.locator('a[href^="/dashboard/service/tickets/"]')).toHaveCount(1)
})

async function signDisplayedMaintenanceProposal(page: Page) {
  await page.getByRole("button", { name: "Actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Envoyer pour signature", exact: true }).click()
  const invitation = page.getByLabel("Lien de signature à partager")
  await expect(invitation).toBeVisible()
  await page.goto(await invitation.inputValue())
  await page.getByLabel("Nom complet du signataire").fill("Fictional maintenance signer")
  await page.getByLabel("Adresse email de validation").fill("signer@example.test")
  const canvas = page.locator("canvas")
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x + 20, box!.y + 90); await page.mouse.down()
  await page.mouse.move(box!.x + 80, box!.y + 35, { steps: 4 }); await page.mouse.move(box!.x + 135, box!.y + 105, { steps: 4 }); await page.mouse.up()
  await page.getByLabel(/Je déclare avoir lu/).check()
  await page.getByLabel(/J'accepte d'apposer ma signature électronique/).check()
  await page.getByRole("button", { name: "Signer électroniquement", exact: true }).click()
  await expect(page.getByRole("heading", { name: /Contrat Signé avec Succès|Ce document a déjà été signé/ })).toBeVisible()
}

async function reopenMaintenance(page: Page, title: string) {
  await page.goto("/dashboard/operations?tab=maintenance")
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  await page.getByRole("textbox", { name: "Rechercher un contrat d’entretien", exact: true }).fill(title)
  const panel = page.locator("details").filter({ has: page.getByText(title, { exact: true }) })
  await panel.locator("summary").click()
  return panel
}

test("Maintenance agreement requires a new signature for changed conditions and preserves the first receipt", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance")
  await database.maintenanceContract.update({ where: { id: fixture.id }, data: { priceCents: 10000, indexationRate: 2, renewalStatus: "UPCOMING" } })
  const initial = await maintenancePanel(page, fixture)
  await initial.getByRole("button", { name: "Créer la proposition", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/contrats\/[^/]+$/.test(url.pathname))
  const firstId = new URL(page.url()).pathname.split("/").at(-1)!
  await signDisplayedMaintenanceProposal(page)
  const first = await database.contract.findUniqueOrThrow({ where: { id: firstId } })
  const panel = await reopenMaintenance(page, fixture.title)
  await panel.getByLabel("Indexation (%)").fill("50")
  await panel.getByRole("button", { name: "Enregistrer le renouvellement", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Paramètres de renouvellement enregistrés.")
  const changed = await reopenMaintenance(page, fixture.title)
  await changed.getByRole("button", { name: "Créer le nouveau terme", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Les conditions du renouvellement ont changé")
  await changed.getByRole("button", { name: "Nouvelle proposition", exact: true }).click()
  await page.getByRole("button", { name: "Préparer le brouillon", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/contrats\/[^/]+$/.test(url.pathname))
  const replacementId = new URL(page.url()).pathname.split("/").at(-1)!
  expect(replacementId).not.toBe(firstId)
  await signDisplayedMaintenanceProposal(page)
  const accepted = await reopenMaintenance(page, fixture.title)
  await accepted.getByRole("button", { name: "Créer le nouveau terme", exact: true }).click()
  await expect(page.locator("[data-sonner-toast]")).toContainText("Contrat renouvelé et nouveau terme créé.")
  const term = await database.maintenanceContract.findFirstOrThrow({ where: { renewedFromId: fixture.id } })
  expect(term.priceCents).toBe(15000)
  expect((await database.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.id } })).acceptedRenewalProposalId).toBe(replacementId)
  const retained = await database.contract.findUniqueOrThrow({ where: { id: firstId } })
  expect(retained.signedDocument).toBe(first.signedDocument); expect(retained.maintenanceRenewalTerms).toBe(first.maintenanceRenewalTerms); expect(retained.status).toBe("SIGNED")
})

test("Maintenance agreement classifies a draft without deletion and prepares a separate successor", async ({ page }, info) => {
  const fixture = await setup(info.project.name, "maintenance")
  const panel = await maintenancePanel(page, fixture)
  await panel.getByRole("button", { name: "Créer la proposition", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/contrats\/[^/]+$/.test(url.pathname))
  const oldId = new URL(page.url()).pathname.split("/").at(-1)!
  const original = await database.contract.findUniqueOrThrow({ where: { id: oldId } })
  await page.getByRole("button", { name: "Actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Classer sans signature", exact: true }).click()
  await page.getByRole("button", { name: "Classer", exact: true }).click()
  await expect.poll(async () => (await database.contract.findUniqueOrThrow({ where: { id: oldId } })).status).toBe("EXPIRED")
  const reopened = await reopenMaintenance(page, fixture.title)
  await reopened.getByRole("button", { name: "Créer la proposition", exact: true }).click()
  await page.waitForURL(url => /^\/dashboard\/contrats\/[^/]+$/.test(url.pathname))
  expect(new URL(page.url()).pathname.split("/").at(-1)).not.toBe(oldId)
  expect((await database.contract.findUniqueOrThrow({ where: { id: oldId } })).content).toBe(original.content)
})
