import { expect, test } from "@playwright/test"

test("searches every studio and preserves an edited model outside its list page", async ({ page }, info) => {
  const surface = info.project.name
  await page.goto("/dashboard/automatisations")
  await page.getByRole("tab", { name: /^Modèles/ }).click()
  const modelPrefix = `UIQA Studio model ${surface}`
  await page.getByRole("textbox", { name: "Rechercher un modèle", exact: true }).fill(modelPrefix)
  // Search results are server-side; wait for the counter, then the final page.
  const modelPagination = page.getByLabel("Pagination : modèles", { exact: true })
  await expect(modelPagination).toContainText("101 résultat(s)")
  for (let index = 0; index < 4; index++) { await modelPagination.getByRole("button", { name: "Page suivante : modèles", exact: true }).click(); await expect(modelPagination).toContainText(`Page ${index + 2} sur 5`) }
  await page.getByRole("button").filter({ has: page.getByText(`${modelPrefix} 000`, { exact: true }) }).click()
  const name = page.getByRole("textbox", { name: "Nom interne", exact: true })
  await expect(name).toHaveValue(`${modelPrefix} 000`)
  await name.fill("Saisie fictive conservée")
  await modelPagination.getByRole("button", { name: "Page précédente : modèles", exact: true }).click()
  await expect(modelPagination).toContainText("Page 4 sur 5")
  await page.getByRole("textbox", { name: "Rechercher un modèle", exact: true }).fill("UIQA-no-match")
  await expect(modelPagination).toContainText("0 résultat(s)")
  await expect(name).toHaveValue("Saisie fictive conservée")
  await page.getByRole("tab", { name: /^Séquences/ }).click()
  const sequencePrefix = `UIQA Studio sequence ${surface}`
  await page.getByRole("textbox", { name: "Rechercher une séquence", exact: true }).fill(sequencePrefix)
  await expect(page.getByLabel("Pagination : séquences", { exact: true })).toContainText("201 résultat(s)")
  await page.getByRole("textbox", { name: "Rechercher une séquence", exact: true }).fill(`${sequencePrefix} 000`)
  await expect(page.getByLabel("Pagination : séquences", { exact: true })).toContainText("1 résultat(s)")
  await page.getByRole("button").filter({ has: page.getByText(`${sequencePrefix} 000`, { exact: true }) }).click()
  const enrollments = page.getByLabel("Inscriptions de la séquence", { exact: true })
  await expect(enrollments).toContainText("26 résultat(s)")
  await enrollments.getByRole("button", { name: "Page suivante : inscriptions", exact: true }).click()
  await expect(enrollments).toContainText("Fiction Studio 000")
  await enrollments.getByRole("textbox", { name: "Rechercher une inscription", exact: true }).fill("Studio 025")
  await expect(enrollments).toContainText("1 résultat(s)")
  await expect(enrollments).toContainText("Fiction Studio 025")
  await page.getByRole("tab", { name: /^Scénarios/ }).click()
  await page.getByRole("textbox", { name: "Rechercher un scénario", exact: true }).fill(`UIQA Studio workflow ${surface}`)
  await expect(page.getByLabel("Pagination : scénarios", { exact: true })).toContainText("201 résultat(s)")
  await page.getByRole("textbox", { name: "Rechercher un scénario", exact: true }).fill(`UIQA Studio workflow ${surface} 000`)
  await expect(page.getByLabel("Pagination : scénarios", { exact: true })).toContainText("1 résultat(s)")
  await page.getByRole("tab", { name: /^Journal/ }).click()
  await page.getByRole("tab", { name: /Adresses bloquées/ }).click()
  await page.getByRole("textbox", { name: "Rechercher une adresse bloquée", exact: true }).fill(`studio-blocked-${surface}`)
  const blocked = page.getByLabel("Pagination : adresses bloquées", { exact: true })
  await expect(blocked).toContainText("101 résultat(s)")
  for (let index = 0; index < 4; index++) { await blocked.getByRole("button", { name: "Page suivante : adresses bloquées", exact: true }).click(); await expect(blocked).toContainText(`Page ${index + 2} sur 5`) }
  await expect(page.getByText(`studio-blocked-${surface}-000@example.test`, { exact: true })).toBeVisible()
})
