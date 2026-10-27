import { expect, test, type Locator, type Page } from "@playwright/test"

async function openTabs(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(route)
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  await page.evaluate(async () => { await document.fonts.ready })
  const list = page.locator("#dashboard-main").getByRole("tablist").first()
  await expect(list).toBeVisible()
  return list
}

async function expectNoVerticalOverflow(list: Locator) {
  await expect.poll(() => list.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  const buttonsFit = await list.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return Array.from(element.querySelectorAll('[role="tab"]')).every(tab => {
      const button = tab.getBoundingClientRect()
      return button.top >= bounds.top - 1 && button.bottom <= bounds.bottom + 1
    })
  })
  expect(buttonsFit).toBe(true)
}

async function reachLastTab(list: Locator, scroller: Locator = list) {
  const tabs = list.getByRole("tab")
  const first = tabs.first()
  const last = tabs.last()
  await first.focus()
  await first.press("End")
  await expect(last).toBeFocused()
  await last.press("Enter")
  await expect(last).toHaveAttribute("aria-selected", "true")
  await expect.poll(async () => {
    const viewport = await scroller.boundingBox()
    const button = await last.boundingBox()
    return Boolean(viewport && button && button.x >= viewport.x - 1 && button.x + button.width <= viewport.x + viewport.width + 1)
  }).toBe(true)
  expect(await last.evaluate(element => element.matches(":focus-visible"))).toBe(true)
  return last
}

for (const route of ["communications", "settings", "operations", "catalogue"]) {
  test(`les onglets ${route} ne défilent pas verticalement et restent accessibles au clavier`, async ({ page }, info) => {
    const width = info.project.name === "mobile" ? 390 : 1440
    const list = await openTabs(page, `/dashboard/${route}`, width)
    await expectNoVerticalOverflow(list)
    if (width === 390 && route !== "catalogue") {
      expect(await list.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    }
    await reachLastTab(list)
    await expectNoVerticalOverflow(list)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}

test("les onglets soulignés conservent leur indicateur et la navigation clavier", async ({ page }, info) => {
  const list = await openTabs(page, "/dashboard/automatisations", info.project.name === "mobile" ? 390 : 1440)
  const last = await reachLastTab(list, list.locator(".."))
  await expect.poll(() => last.evaluate(element => getComputedStyle(element, "::after").opacity)).toBe("1")
  const indicator = await last.evaluate(element => {
    const style = getComputedStyle(element, "::after")
    return { display: style.display, opacity: style.opacity, height: parseFloat(style.height) }
  })
  expect(indicator.display).not.toBe("none")
  expect(indicator.opacity).toBe("1")
  expect(indicator.height).toBeGreaterThan(0)
})
