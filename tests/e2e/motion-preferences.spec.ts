import { expect, test, type Page } from "@playwright/test"

async function sampleMenuOpening(page: Page) {
  const samples = await page.evaluateHandle(() => {
    const state = { offsets: [] as number[], complete: false }
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-controls="marketing-mobile-nav"]')
    if (!trigger) throw new Error("Le bouton du menu public est absent")
    trigger.addEventListener("click", () => {
      let remaining = 12
      const record = () => {
        const menu = document.getElementById("marketing-mobile-nav")
        if (menu) {
          const transform = getComputedStyle(menu).transform
          state.offsets.push(transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42)
        }
        if (--remaining > 0) requestAnimationFrame(record)
        else state.complete = true
      }
      requestAnimationFrame(record)
    }, { once: true })
    return state
  })

  try {
    await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click()
    await expect(page.getByRole("navigation", { name: "Navigation mobile", exact: true })).toBeVisible()
    await expect.poll(() => samples.evaluate(state => state.complete)).toBe(true)
    const offsets = await samples.evaluate(state => state.offsets)
    expect(offsets.length).toBeGreaterThan(1)
    expect(offsets.every(offset => Math.abs(offset) < 0.01)).toBe(true)
  } finally {
    await samples.dispose()
  }
}

test("le menu public respecte le mouvement réduit dès l’ouverture et après un changement de préférence", async ({ page }) => {
  const hydrationErrors: string[] = []
  const motionWarnings: string[] = []
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrated|server rendered|didn't match|did not match|React error #418/i.test(message.text())) hydrationErrors.push(message.text())
    if (message.type() === "warning" && /strokeDashoffset.*undefined/i.test(message.text())) motionWarnings.push(message.text())
  })
  page.on("pageerror", error => hydrationErrors.push(error.message))
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)

  await sampleMenuOpening(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("navigation", { name: "Navigation mobile", exact: true })).toBeHidden()
  await expect(page.getByRole("button", { name: "Ouvrir le menu", exact: true })).toBeFocused()

  await page.emulateMedia({ reducedMotion: "no-preference" })
  const route = page.locator('path[stroke-dasharray="3 18"]')
  await expect.poll(() => route.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBeLessThan(0)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect.poll(() => route.evaluate(element => Number.parseFloat(getComputedStyle(element).strokeDashoffset))).toBe(0)
  await sampleMenuOpening(page)
  expect(hydrationErrors).toEqual([])
  expect(motionWarnings).toEqual([])
})

test("la progression de lecture suit le scroll sans ressort en mode réduit", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  const bar = page.locator('[data-slot="marketing-scroll-progress"]')
  await expect(bar).toHaveCount(1)

  // Provider hydration alone does not establish the page's scroll subscription.
  // Observe one update before measuring a second scroll's unsmoothed response.
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 500)
  })
  await expect.poll(() => bar.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m11)).toBeGreaterThan(0)

  const progress = await page.evaluate(async () => {
    window.scrollTo(0, 1000)
    for (let frame = 0; frame < 3; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const bar = document.querySelector('[data-slot="marketing-scroll-progress"]')
    if (!bar) throw new Error("La progression de lecture est absente")
    const maximum = document.documentElement.scrollHeight - innerHeight
    return {
      actual: new DOMMatrixReadOnly(getComputedStyle(bar).transform).m11,
      expected: scrollY / maximum,
      scrollY,
      scrollTop: document.scrollingElement?.scrollTop,
      maximum,
      transform: getComputedStyle(bar).transform,
    }
  })
  await info.attach("reduced-scroll-response", { body: JSON.stringify(progress), contentType: "application/json" })
  expect(progress.expected).toBeGreaterThan(0)
  expect(progress.actual).toBeCloseTo(progress.expected, 3)
})

test("le Pipeline répond immédiatement au clavier et arrête le défilement quand le mouvement est réduit", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Le Pipeline mobile affiche une étape à la fois, sans défilement horizontal")
  await page.setViewportSize({ width: 1000, height: 900 })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/dashboard/pipeline")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  const viewport = page.getByRole("region", { name: "Étapes du cycle de vente", exact: true })
  await expect(viewport).toBeVisible()
  const maximum = await viewport.evaluate(element => element.scrollWidth - element.clientWidth)
  expect(maximum).toBeGreaterThan(0)

  await viewport.press("End")
  expect(await viewport.evaluate(element => element.scrollLeft)).toBeCloseTo(maximum, 0)
  await viewport.press("Home")
  expect(await viewport.evaluate(element => element.scrollLeft)).toBe(0)

  await page.getByRole("button", { name: "Afficher les étapes suivantes", exact: true }).click()
  await page.emulateMedia({ reducedMotion: "reduce" })
  const position = await viewport.evaluate(async element => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return element.scrollLeft
  })
  await viewport.evaluate(async () => {
    for (let frame = 0; frame < 3; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
  expect(await viewport.evaluate(element => element.scrollLeft)).toBeCloseTo(position, 1)
})
