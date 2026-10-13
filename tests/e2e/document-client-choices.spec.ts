import { PrismaClient } from "@prisma/client"
import { expect, test, type Locator, type Page } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
const forms = [
  { kind: "quote", route: "devis", clientLabel: "Client du devis", titleId: "object", dateId: "validUntil" },
  { kind: "invoice", route: "factures", clientLabel: "Client de la facture", titleId: "object", dateId: "dueDate" },
  { kind: "contract", route: "contrats", clientLabel: "Client destinataire du contrat", titleId: "title", dateId: "validUntil" },
  { kind: "opportunity", route: "pipeline", clientLabel: "Client", titleId: "title", dateId: "closeDate" },
] as const
type Form = typeof forms[number]

function scope(page: Page, form: Form) {
  return form.kind === "opportunity" ? page.getByRole("dialog") : page.locator("form").filter({ has: page.getByRole("combobox", { name: form.clientLabel, exact: true }) })
}
async function fillFields(container: Locator, form: Form, title: string) {
  await container.locator(`#${form.titleId}`).fill(title)
  await container.locator(`#${form.dateId}`).fill("2030-02-01")
  if (form.kind === "quote" || form.kind === "invoice") {
    await container.getByLabel("Libellé de la ligne 1", { exact: true }).fill("Fictional preserved choice line")
    await container.getByLabel("Quantité de la ligne 1", { exact: true }).fill("2")
    await container.getByLabel("Prix unitaire hors taxes de la ligne 1", { exact: true }).fill("123.45")
  } else if (form.kind === "contract") {
    await container.locator("#validFrom").fill("2029-01-02")
    await container.locator('[contenteditable="true"]').fill("Fictional preserved contract body")
  } else {
    await container.locator("#value").fill("123.45")
    await container.locator("#prob").fill("55")
  }
}
async function fieldsRemain(container: Locator, form: Form, title: string) {
  await expect(container.locator(`#${form.titleId}`)).toHaveValue(title)
  await expect(container.locator(`#${form.dateId}`)).toHaveValue("2030-02-01")
  if (form.kind === "quote" || form.kind === "invoice") {
    await expect(container.getByLabel("Quantité de la ligne 1", { exact: true })).toHaveValue("2")
    await expect(container.getByLabel("Prix unitaire hors taxes de la ligne 1", { exact: true })).toHaveValue("123.45")
    await expect(container.getByLabel("Libellé de la ligne 1", { exact: true })).toHaveValue("Fictional preserved choice line")
  } else if (form.kind === "contract") {
    await expect(container.locator("#validFrom")).toHaveValue("2029-01-02")
    await expect(container.locator('[contenteditable="true"]')).toHaveText("Fictional preserved contract body")
  } else {
    await expect(container.locator("#value")).toHaveValue("123.45")
    await expect(container.locator("#prob")).toHaveValue("55")
  }
}
async function savedRow(form: Form, companyId: string, title: string, clientId: string) {
  const line = { label: "Fictional preserved choice line", quantity: 2, unitPriceCents: 12345 }
  if (form.kind === "quote") {
    const row = await database.quote.findFirstOrThrow({ where: { companyId, object: title }, include: { versions: { orderBy: { version: "desc" }, take: 1, include: { sections: { include: { lines: true } } } } } })
    expect(row.clientId).toBe(clientId); expect(row.validUntil?.toISOString().slice(0, 10)).toBe("2030-02-01")
    expect(row.versions[0].totalHtCents).toBe(24690); expect(row.versions[0].sections.flatMap(section => section.lines)).toEqual([expect.objectContaining(line)])
  } else if (form.kind === "invoice") {
    const row = await database.invoice.findFirstOrThrow({ where: { companyId, object: title }, include: { lines: true } })
    expect(row).toMatchObject({ clientId, totalHtCents: 24690, status: "DRAFT", lines: [line] })
    expect(row.dueDate.toISOString().slice(0, 10)).toBe("2030-02-01")
  } else if (form.kind === "contract") {
    const row = await database.contract.findFirstOrThrow({ where: { companyId, title } })
    expect(row.clientId).toBe(clientId); expect(row.content).toContain("Fictional preserved contract body")
    expect(row.validUntil?.toISOString().slice(0, 10)).toBe("2030-02-01"); expect(row.validFrom?.toISOString().slice(0, 10)).toBe("2029-01-02")
  } else {
    const row = await database.opportunity.findFirstOrThrow({ where: { pipeline: { companyId }, title } })
    expect(row).toMatchObject({ clientId, valueCents: 12345, probability: 55, status: "PROSPECT" })
    expect(row.closeDate?.toISOString().slice(0, 10)).toBe("2030-02-01")
  }
}
async function save(page: Page, container: Locator, form: Form, create: boolean) {
  const button = container.getByRole("button", { name: form.kind === "opportunity" && create ? "Créer" : "Enregistrer", exact: true })
  await expect(button).toBeEnabled(); await button.click()
  if (form.kind === "opportunity") await expect(container).toBeHidden()
  else await page.waitForURL(url => url.pathname.startsWith(`/dashboard/${form.route}/`) && !url.pathname.endsWith("/new") && !url.pathname.endsWith("/edit"))
}

for (const form of forms) {
  test(`${form.kind}: complete client choices preserve creation, editing and recovery`, async ({ page }, info) => {
    if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette des choix Client exige une SQLite fictive isolée")
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    const lastId = `cdocchoicelast${form.kind}${info.project.name}`
    const client = await database.client.findUniqueOrThrow({ where: { id: lastId } })
    await page.context().clearCookies(); await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`document-choice-${form.kind}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    const oldId = `cdocchoiceold${form.kind}${info.project.name}`
    if (form.kind === "opportunity") {
      await page.goto("/dashboard/pipeline")
      await page.getByRole("button", { name: "Ouvrir les actions de l’opportunité", exact: true }).click()
      await page.getByRole("menuitem", { name: "Éditer", exact: true }).click()
    } else await page.goto(`/dashboard/${form.route}/${oldId}/edit`)
    let container = scope(page, form)
    await expect(container.getByText("1 001 résultats", { exact: true })).toBeVisible()
    await expect(container.getByRole("combobox", { name: form.clientLabel, exact: true })).toContainText("ZZ DERNIER CLIENT")
    await container.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(container.getByText("Page 2 sur 41", { exact: true })).toBeVisible()
    const editedTitle = `Edited choice ${form.kind} ${info.project.name}`
    await fillFields(container, form, editedTitle)
    const actionUrl = `**${new URL(page.url()).pathname}`
    await page.route(actionUrl, async route => {
      if (route.request().headers()["next-action"] && route.request().postData()?.includes("FAIL-CHOICES")) await route.fulfill({ status: 503, body: "Fictional client lookup failure" })
      else await route.continue()
    })
    await container.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("FAIL-CHOICES")
    await expect(container.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
    await expect(container.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled()
    await fieldsRemain(container, form, editedTitle)
    await page.unroute(actionUrl)
    await container.getByRole("button", { name: "Réessayer", exact: true }).click()
    await expect(container.getByRole("alert")).toHaveCount(0)
    await container.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("no matching client")
    await expect(container.getByText("0 résultats", { exact: true })).toBeVisible()
    await expect(container.getByRole("combobox", { name: form.clientLabel, exact: true })).toContainText("ZZ DERNIER CLIENT")
    await save(page, container, form, false)
    await savedRow(form, client.companyId, editedTitle, lastId)

    async function openNew() {
      await page.goto(`/dashboard/${form.route}${form.kind === "opportunity" ? "" : `/new${form.kind === "quote" ? `?clientId=${lastId}` : ""}`}`)
      await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
      if (form.kind === "opportunity") await page.getByRole("button", { name: "Nouvelle opportunité", exact: true }).click()
      container = scope(page, form)
      await expect(container.getByText("1 001 résultats", { exact: true })).toBeVisible()
      if (form.kind !== "quote") {
        await container.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("dernier client")
        await expect(container.getByText("1 résultat", { exact: true })).toBeVisible()
        await container.getByRole("combobox", { name: form.clientLabel, exact: true }).click()
        await page.getByRole("option", { name: "ZZ DERNIER CLIENT", exact: true }).click()
      }
      await expect(container.getByRole("combobox", { name: form.clientLabel, exact: true })).toContainText("ZZ DERNIER CLIENT")
    }
    await openNew()
    const createdTitle = `Created choice ${form.kind} ${info.project.name}`
    await fillFields(container, form, createdTitle)
    await container.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("no matching client")
    await expect(container.getByText("0 résultats", { exact: true })).toBeVisible()
    await save(page, container, form, true)
    await savedRow(form, client.companyId, createdTitle, lastId)

    await openNew()
    const replacedTitle = `Replaced choice ${form.kind} ${info.project.name}`
    await fillFields(container, form, replacedTitle)
    await container.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("Client 0000")
    await expect(container.getByText("1 résultat", { exact: true })).toBeVisible()
    await container.getByRole("combobox", { name: form.clientLabel, exact: true }).click()
    await page.getByRole("option", { name: "Client 0000", exact: true }).click()
    const removed = await database.client.findFirstOrThrow({ where: { companyId: client.companyId, name: "Client 0000" } })
    await database.client.delete({ where: { id: removed.id } })
    await container.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("Client 0001")
    await expect(container.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
    await expect(container.getByRole("button", { name: form.kind === "opportunity" ? "Créer" : "Enregistrer", exact: true })).toBeDisabled()
    await expect(container.getByRole("combobox", { name: form.clientLabel, exact: true })).toContainText("Client 0000")
    await fieldsRemain(container, form, replacedTitle)
    await container.getByRole("combobox", { name: form.clientLabel, exact: true }).click()
    await page.getByRole("option", { name: "Client 0001", exact: true }).click()
    await expect(container.getByRole("alert")).toHaveCount(0)
    await save(page, container, form, true)
    const replacement = await database.client.findFirstOrThrow({ where: { companyId: client.companyId, name: "Client 0001" } })
    await savedRow(form, client.companyId, replacedTitle, replacement.id)
    expect(errors).toEqual([])
  })
}
