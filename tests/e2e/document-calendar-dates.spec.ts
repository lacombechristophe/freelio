import { expect, test } from "@playwright/test"

for (const timezoneId of ["Pacific/Kiritimati", "America/Los_Angeles"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId })

    test("keeps document calendar dates identical before and after hydration", async ({ page }, info) => {
      await page.context().clearCookies()
      await page.goto("/auth/login")
      await page.getByLabel("Adresse e-mail professionnelle").fill(`document-dates-${info.project.name}@example.test`)
      await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
      await page.getByRole("button", { name: "Se connecter", exact: true }).click()
      await page.waitForURL(url => url.pathname === "/dashboard")

      const errors: string[] = []
      page.on("pageerror", error => errors.push(error.message))
      for (const [route, prefix, dateColumn] of [
        ["/dashboard/devis", "CALENDAR-QUOTE", 4],
        ["/dashboard/factures", "CALENDAR-INVOICE", 4],
        ["/dashboard/depenses", "CALENDAR-EXPENSE", 0],
      ] as const) {
        const response = await page.request.get(route)
        expect(response.status()).toBe(200)
        const html = await response.text()
        await page.goto(route)
        const serverDates = await page.evaluate(({ html, prefix, dateColumn }) => {
          const document = new DOMParser().parseFromString(html, "text/html")
          return ["LATE", "EARLY"].map(marker => {
            const row = [...document.querySelectorAll("tbody tr")].find(row => row.textContent?.includes(`${prefix}-${marker}`))
            return row?.querySelectorAll("td")[dateColumn]?.textContent?.trim()
          })
        }, { html, prefix, dateColumn })
        expect(serverDates).toEqual(["31 déc. 1999", "1 janv. 2000"])

        for (const [marker, expectedDate] of [["LATE", "31 déc. 1999"], ["EARLY", "1 janv. 2000"]]) {
          // Filtering proves that hydration and the page's real read action work.
          await page.locator('#dashboard-main input[placeholder*="Rechercher"]').first().fill(`${prefix}-${marker}`)
          const rows = page.locator("#dashboard-main tbody tr")
          await expect(rows).toHaveCount(1)
          await expect(rows.first()).toContainText(`${prefix}-${marker}`)
          await expect(rows.first().locator("td").nth(dateColumn)).toHaveText(expectedDate)
        }
      }
      expect(errors).toEqual([])
    })
  })
}
