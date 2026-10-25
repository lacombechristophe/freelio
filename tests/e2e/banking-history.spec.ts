import { expect, test } from "@playwright/test"

test("recovers a CSV selected before the client handlers are attached", async ({ page }) => {
  let release!: () => void
  const scripts = new Promise<void>(resolve => { release = resolve })
  await page.route("**/_next/static/**/*.js", async route => { await scripts; await route.continue() })
  try {
    await page.goto("/dashboard/comptabilite/banque", { waitUntil: "commit" })
    await page.getByLabel("Sélectionner un relevé bancaire CSV", { exact: true }).setInputFiles({
      name: "early-fictional.csv", mimeType: "text/csv", buffer: Buffer.from("Date;Libellé;Montant\n01/01/2030;Fictional early selection;1,00\n"),
    })
  } finally { release() }
  await expect(page.getByText("1 ligne(s) valide(s) sur 1", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeEnabled()
})

test("pages the full bank history and keeps CSV mapping and an off-page expense choice", async ({ page }, info) => {
  const prefix = `UIQA Bank history ${info.project.name}`
  await page.goto("/dashboard/comptabilite/banque")
  await page.getByLabel("Sélectionner un relevé bancaire CSV", { exact: true }).setInputFiles({ name: "fictional.csv", mimeType: "text/csv", buffer: Buffer.from("Date;Libellé;Montant;Référence\n01/01/2030;Fictional pending CSV;1,00;Pending fixture\n") })
  await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeEnabled()
  const history = page.getByLabel("Historique bancaire", { exact: true })
  await history.getByRole("textbox", { name: "Rechercher une transaction", exact: true }).fill(prefix)
  await expect(history).toContainText("251 transaction(s) · Page 1 / 11")
  await history.getByRole("textbox", { name: "Rechercher une transaction", exact: true }).fill(`${prefix} 250`)
  await expect(history).toContainText("1 transaction(s) · Page 1 / 1")
  const credit = history.getByRole("row").filter({ hasText: `${prefix} 250` })
  await credit.getByRole("textbox", { name: "Rechercher une correspondance", exact: true }).fill(`UIQA-BANK-${info.project.name}`)
  await expect(credit).toContainText("26 correspondance(s) · Page 1 / 2")
  await credit.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(credit).toContainText("26 correspondance(s) · Page 2 / 2")
  await history.getByRole("textbox", { name: "Rechercher une transaction", exact: true }).fill(prefix)
  await expect(history).toContainText("251 transaction(s) · Page 1 / 11")
  for (let index = 0; index < 10; index++) {
    await history.getByRole("button", { name: "Page suivante", exact: true }).first().click()
    await expect(history).toContainText(`251 transaction(s) · Page ${index + 2} / 11`)
  }
  await expect(history.getByText(`${prefix} 000`, { exact: true })).toBeVisible()
  await expect(page.getByText("1 ligne(s) valide(s) sur 1", { exact: true })).toBeVisible()
  const row = history.getByRole("row").filter({ hasText: `${prefix} 000` })
  await row.getByRole("textbox", { name: "Rechercher une correspondance", exact: true }).fill(`UIQA Bank expense ${info.project.name}`)
  await expect(row).toContainText("101 correspondance(s) · Page 1 / 5")
  for (let index = 0; index < 4; index++) {
    await row.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(row).toContainText(`101 correspondance(s) · Page ${index + 2} / 5`)
  }
  await row.getByRole("combobox", { name: "Correspondance bancaire", exact: true }).click()
  await page.getByRole("option").filter({ hasText: `UIQA Bank expense ${info.project.name} 000` }).click()
  await row.getByRole("textbox", { name: "Rechercher une correspondance", exact: true }).fill("UIQA-no-candidate")
  await expect(row).toContainText("0 correspondance(s)")
  await expect(row.getByRole("combobox", { name: "Correspondance bancaire", exact: true })).toContainText(`UIQA Bank expense ${info.project.name} 000`)
  await history.getByRole("button", { name: "Page précédente", exact: true }).first().click()
  await expect(history).toContainText("Page 10 / 11")
  await history.getByRole("button", { name: "Page suivante", exact: true }).first().click()
  await expect(history).toContainText("Page 11 / 11")
  await expect(row.getByRole("combobox", { name: "Correspondance bancaire", exact: true })).toContainText(`UIQA Bank expense ${info.project.name} 000`)
  await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeEnabled()
})

test("rejects an impossible CSV date without clearing its mapping, then accepts a corrected leap date", async ({ page }, info) => {
  await page.goto("/dashboard/comptabilite/banque")
  const file = page.getByLabel("Sélectionner un relevé bancaire CSV", { exact: true })
  const csv = (date: string) => ({ name: "fictional-dates.csv", mimeType: "text/csv", buffer: Buffer.from(`Date;Libellé;Montant;Référence\n${date};UIQA Bank leap ${info.project.name};1,00;Fictional leap\n`) })
  await file.setInputFiles(csv("31/02/2030"))
  await page.getByRole("button", { name: "Importer", exact: true }).click()
  await expect(page.getByText("Date bancaire invalide : 31/02/2030", { exact: true })).toBeVisible()
  await expect(page.getByText("0 ligne(s) valide(s) sur 1", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeEnabled()
  await file.setInputFiles(csv("29/02/2032"))
  await page.getByRole("button", { name: "Importer", exact: true }).click()
  await expect(page.getByText("1 transaction(s) importée(s), 0 doublon(s) ignoré(s).", { exact: true })).toBeVisible()
  await page.getByRole("textbox", { name: "Rechercher une transaction", exact: true }).fill(`UIQA Bank leap ${info.project.name}`)
  await expect(page.getByLabel("Historique bancaire", { exact: true })).toContainText("1 transaction(s)")
})
