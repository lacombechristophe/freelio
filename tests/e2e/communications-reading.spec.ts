import { expect, test } from "@playwright/test"

test("reads paginated conversations, archive filters and older messages on desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/dashboard/communications")
  const filter = page.getByLabel("Conversations affichées")
  const search = page.getByLabel("Recherche", { exact: true })
  async function find(value: string) {
    await search.fill(value)
    await page.getByRole("button", { name: "Rechercher", exact: true }).click()
  }
  await find("UIQA Inbox")
  await expect(page.getByText("125 fil(s)", { exact: true })).toBeVisible()
  await expect(page.getByText("Page 1 sur 3", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(page.getByText("Page 2 sur 3", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(page.getByText("Page 3 sur 3", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Page suivante", exact: true })).toBeDisabled()
  await expect(page.locator("button[data-selected]")).toHaveCount(25)
  await page.getByRole("button", { name: "Page précédente", exact: true }).click()
  await expect(page.getByText("Page 2 sur 3", { exact: true })).toBeVisible()
  await search.fill("UIQA Unread")
  await filter.selectOption("UNREAD")
  await expect(page.locator("button[data-selected]").filter({ hasText: "UIQA Unread conversation" })).toBeVisible()
  await search.fill("UIQA Archived")
  await filter.selectOption("ARCHIVED")
  await expect(page.getByText("1 fil(s)", { exact: true })).toBeVisible()
  await expect(page.locator("button[data-selected]").filter({ hasText: "UIQA Archived conversation" })).toBeVisible()
  await search.fill("UIQA Long history")
  await filter.selectOption("ALL")
  const conversation = page.locator("button[data-selected]").filter({ hasText: "UIQA Long history" })
  await conversation.click()
  await expect(page.locator("article")).toHaveCount(25)
  await expect(page.getByText("UIQA History 100", { exact: true })).toBeVisible()
  const older = page.getByRole("button", { name: "Messages précédents", exact: true })
  for (const count of [50, 75, 100, 101]) {
    await older.click()
    await expect(page.locator("article")).toHaveCount(count)
  }
  await expect(older).toHaveCount(0)
  await expect(page.getByText("UIQA History 000", { exact: true })).toBeVisible()
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Retour aux conversations" }).click()
    await expect(conversation).toBeFocused()
  }
  const main = page.locator("#dashboard-main")
  expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
})
