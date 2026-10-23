import { expect, test } from "@playwright/test"

test("finds old notifications and preserves the directory URL when navigating back and refreshing", async ({ page }, info) => {
  const search = `UIQA Notification history ${info.project.name}`
  await page.goto("/dashboard/notifications")
  await page.getByRole("textbox", { name: "Rechercher une notification" }).fill(search)
  await page.getByRole("button", { name: "Rechercher", exact: true }).click()
  await expect(page.getByRole("status", { exact: false }).filter({ hasText: "51 résultats" })).toBeVisible()
  await expect(page.getByText("Page 1 sur 3", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(page.getByText("Page 2 sur 3", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(page.getByText(`${search} oldest`, { exact: true })).toBeVisible()
  await expect(page.getByText("Page 3 sur 3", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/page=3/)
  await page.reload()
  await expect(page.getByRole("textbox", { name: "Rechercher une notification" })).toHaveValue(search)
  await expect(page.getByText(`${search} oldest`, { exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByText("Page 2 sur 3", { exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Rechercher une notification" })).toHaveValue(search)
})

test("filters the complete notification history by read state", async ({ page }, info) => {
  const search = `UIQA Notification history ${info.project.name}`
  await page.goto(`/dashboard/notifications?${new URLSearchParams({ search, status: "READ", page: "2" })}`)
  await expect(page.getByText("50 résultats", { exact: true })).toBeVisible()
  await expect(page.getByText("Page 2 sur 2", { exact: true })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "État de lecture" })).toHaveValue("READ")
  await page.getByRole("combobox", { name: "État de lecture" }).selectOption("UNREAD")
  await page.getByRole("button", { name: "Rechercher", exact: true }).click()
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(page.getByText(`${search} oldest`, { exact: true })).toBeVisible()
  await expect(page.getByText("Page 1 sur 1", { exact: true })).toBeVisible()
})
