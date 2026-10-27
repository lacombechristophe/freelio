import { expect, test } from "@playwright/test"

test("logout abandons pending authenticated page responses", async ({ page, context }) => {
  await page.goto("/dashboard")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)

  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  let received!: () => void
  const authenticatedResponse = new Promise<void>(resolve => { received = resolve })
  let finished!: () => void
  const responseFinished = new Promise<void>(resolve => { finished = resolve })
  const probe = "/dashboard/catalogue?logout-probe=1"
  let responseRenewsSession = false
  let responseError: unknown
  await page.route("**/dashboard/catalogue?logout-probe=1", async route => {
    try {
      const response = await route.fetch()
      responseRenewsSession = response.headersArray().some(header =>
        header.name.toLowerCase() === "set-cookie" && /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(header.value),
      )
      received()
      await held
      await route.fulfill({ response })
    } catch (error) {
      received()
      if (!route.request().failure()?.errorText.includes("ERR_ABORTED")) responseError = error
    } finally {
      finished()
    }
  })

  try {
    await page.evaluate(path => {
      void fetch(path, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }).catch(() => {})
    }, probe)
    await authenticatedResponse
    expect(responseRenewsSession).toBe(true)
    const abandonedResponse = page.waitForEvent("requestfailed", {
      predicate: request => new URL(request.url()).pathname + new URL(request.url()).search === probe,
      timeout: 15_000,
    })
    let documentNavigation = false
    page.on("request", request => {
      if (request.isNavigationRequest() && request.resourceType() === "document" && new URL(request.url()).pathname === "/auth/login") documentNavigation = true
    })
    await page.getByRole("button", { name: "Ouvrir le menu du compte" }).click()
    await page.getByRole("menuitem", { name: "Déconnexion", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/auth/login")
    await expect(page.locator("#dashboard-main")).toHaveCount(0)
    expect((await abandonedResponse).failure()?.errorText).toContain("ERR_ABORTED")
    release()
    await responseFinished
    expect(responseError).toBeUndefined()
    expect(documentNavigation).toBe(true)
    expect(await (await context.request.get("/api/auth/session")).json()).toBeNull()
    const protectedPage = await context.request.get("/dashboard", { maxRedirects: 0 })
    expect(protectedPage.status()).toBe(307)
    expect(new URL(protectedPage.headers().location, page.url()).pathname).toBe("/auth/login")
    expect(await (await context.request.get("/api/auth/session")).json()).toBeNull()
  } finally {
    release()
  }
})
