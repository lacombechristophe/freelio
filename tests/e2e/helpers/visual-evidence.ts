import type { Locator, Page } from "@playwright/test"
import path from "node:path"

/** Capture the app's actual scroll container without changing its CSS or viewport. */
export async function captureScrollablePage(page: Page, directory: string, name: string, main: Locator = page.locator("#dashboard-main")) {
  const files: string[] = []
  await main.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }))
  let complete = false

  for (let index = 0; index < 40; index += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const filename = index === 0 ? `${name}.jpg` : `${name}--scroll-${String(index + 1).padStart(2, "0")}.jpg`
    await page.screenshot({ path: path.join(directory, filename), type: "jpeg", quality: 80, animations: "disabled" })
    files.push(filename)
    const position = await main.evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }))
    if (position.top + position.height >= position.total - 2) {
      complete = true
      break
    }
    await main.evaluate((element) => element.scrollTo({ top: element.scrollTop + element.clientHeight * 0.8, behavior: "instant" }))
  }

  await main.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }))
  return { viewport: page.viewportSize(), files, complete }
}
