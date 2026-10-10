import { expect, test } from "@playwright/test"

test("reads older deliveries and preserves a sequence choice outside the current selector page", async ({ page }, info) => {
  const prefix = `UIQA Mail journal ${info.project.name}`, sequence = `UIQA Mail selector ${info.project.name}`
  await page.goto("/dashboard/automatisations")
  await page.getByRole("tab", { name: /^Journal/ }).click()
  await page.getByRole("tab", { name: /E-mails/ }).click()
  const panel = page.getByRole("tabpanel", { name: /E-mails/ }), rows = panel.locator("[data-email-delivery]")
  const search = page.getByRole("textbox", { name: "Rechercher dans le journal", exact: true })
  await search.fill(prefix)
  await expect(panel).toContainText("101 e-mail(s) · Page 1 sur 5")
  await expect(rows).toHaveCount(25)
  for (let number = 2; number <= 5; number++) {
    await page.getByRole("button", { name: "Page suivante : e-mails", exact: true }).click()
    await expect(panel).toContainText(`101 e-mail(s) · Page ${number} sur 5`)
  }
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText(`${prefix} 000`)
  await search.fill(`${prefix.toUpperCase()} 000`)
  await page.getByRole("combobox", { name: "Filtrer par état", exact: true }).selectOption("FAILED")
  await expect(panel).toContainText("1 e-mail(s) · Page 1 sur 1")
  await rows.click()
  await expect(page.getByRole("dialog", { name: `${prefix} 000`, exact: true })).toContainText("Échec")
  await page.keyboard.press("Escape")
  await search.fill("")
  const sequenceSearch = page.getByRole("textbox", { name: "Rechercher une séquence du journal", exact: true })
  const choices = page.getByRole("combobox", { name: "Filtrer par séquence", exact: true })
  await sequenceSearch.fill(sequence)
  await expect(choices.locator("option")).toHaveCount(26)
  for (let number = 2; number <= 3; number++) {
    await page.getByRole("button", { name: "Page suivante : séquences du journal", exact: true }).click()
    await expect(choices.locator("option")).toHaveCount(number === 2 ? 26 : 2)
    await expect(choices.locator("option").nth(1)).toHaveText(`${sequence} ${number === 2 ? "025" : "050"}`)
  }
  await choices.selectOption({ label: `${sequence} 050` })
  await expect(panel).toContainText("1 e-mail(s) · Page 1 sur 1")
  await expect(rows).toContainText(`${prefix} 050`)
  const selected = await choices.inputValue()
  await sequenceSearch.fill("FICTIONAL_SEQUENCE_NOT_FOUND")
  await expect(choices.locator("option")).toHaveCount(2)
  await expect(choices).toHaveValue(selected)
  await expect(choices.locator("option:checked")).toHaveText(`${sequence} 050`)
  await expect(rows).toContainText(`${prefix} 050`)
})
