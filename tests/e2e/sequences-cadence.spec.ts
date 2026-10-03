import { expect, test } from "@playwright/test"

test("loads each sequence's own cadence and sender when switching without a reload", async ({ page }, testInfo) => {
  const prefix = `UIQA Cadence ${testInfo.project.name} ${Date.now()}`
  await page.goto("/dashboard/automatisations")
  await page.getByRole("tab", { name: "Séquences" }).click()
  const panel = page.getByRole("tabpanel", { name: "Séquences" })
  async function create(name: string) {
    await panel.getByRole("button", { name: "Nouvelle séquence", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Nouvelle séquence", exact: true })
    await dialog.getByLabel("Nom", { exact: true }).fill(name)
    await dialog.getByRole("button", { name: "Créer la séquence", exact: true }).click()
    await expect(dialog).toBeHidden()
    await panel.getByText(name, { exact: true }).first().click()
  }
  const first = `${prefix} A`, second = `${prefix} B`
  await create(first)
  const cadence = panel.locator("details").filter({ hasText: "Cadence et fenêtre d’envoi" })
  await cadence.locator("summary").click()
  await cadence.locator('input[name="businessDaysOnly"]').uncheck()
  await cadence.locator('select[name="sendWindowStart"]').selectOption("2")
  await cadence.locator('select[name="sendWindowEnd"]').selectOption("22")
  await cadence.locator('select[name="timezone"]').selectOption("UTC")
  await cadence.locator('select[name="senderChannelId"]').selectOption("cuiqareplysecondmailbox00")
  await cadence.getByRole("button", { name: "Enregistrer la cadence", exact: true }).click()
  await expect(page.getByText("Cadence enregistrée.").last()).toBeVisible()
  await create(second)
  await expect(cadence.locator('input[name="businessDaysOnly"]')).toBeChecked()
  await expect(cadence.locator('select[name="sendWindowStart"]')).toHaveValue("8")
  await expect(cadence.locator('select[name="sendWindowEnd"]')).toHaveValue("18")
  await expect(cadence.locator('select[name="timezone"]')).toHaveValue("Europe/Paris")
  await expect(cadence.locator('select[name="senderChannelId"]')).toHaveValue("")
  await panel.getByText(first, { exact: true }).first().click()
  await expect(cadence.locator('input[name="businessDaysOnly"]')).not.toBeChecked()
  await expect(cadence.locator('select[name="sendWindowStart"]')).toHaveValue("2")
  await expect(cadence.locator('select[name="sendWindowEnd"]')).toHaveValue("22")
  await expect(cadence.locator('select[name="timezone"]')).toHaveValue("UTC")
  await expect(cadence.locator('select[name="senderChannelId"]')).toHaveValue("cuiqareplysecondmailbox00")
})
