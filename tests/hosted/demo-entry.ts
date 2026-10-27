import { expect, type Frame, type Page, type Request } from "@playwright/test"

/** Exercise the same public entry as a visitor, without receiving any credential. */
export async function openHostedDemo(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("The hosted demonstration origin is required")
  const navigation: string[] = []
  const callbacks: Array<{ path: string; method: string; fields: string[] }> = []
  const onNavigation = (frame: Frame) => {
    if (frame === page.mainFrame() && frame.url().startsWith(baseURL)) navigation.push(new URL(frame.url()).pathname)
  }
  const onRequest = (request: Request) => {
    const url = new URL(request.url())
    if (url.origin !== baseURL || !url.pathname.startsWith("/api/auth/callback/")) return
    // Keep only field names: the CSRF value and session cookies never enter reports.
    callbacks.push({ path: url.pathname, method: request.method(), fields: [...new URLSearchParams(request.postData() ?? "").keys()].sort() })
  }
  page.on("framenavigated", onNavigation)
  page.on("request", onRequest)
  try {
    expect((await page.goto("/"))?.status()).toBe(200)
    await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0)
    const entry = page.getByRole("link", { name: "Ouvrir la démonstration", exact: true }).first()
    await expect(entry).toBeVisible()
    await expect(entry).toHaveAttribute("href", "/demo")
    const callbackPromise = page.waitForRequest(request => new URL(request.url()).pathname === "/api/auth/callback/demo")
    await entry.click()
    const callback = await callbackPromise
    expect(callback.method()).toBe("POST")
    const fields = new URLSearchParams(callback.postData() ?? "")
    expect(Boolean(fields.get("csrfToken"))).toBe(true)
    const redirect = new URL(fields.get("callbackUrl") ?? "", baseURL)
    expect(redirect.origin).toBe(baseURL)
    expect(redirect.pathname).toBe("/dashboard")
    expect(redirect.search).toBe("")
    expect(redirect.hash).toBe("")
    await page.waitForURL(url => url.pathname === "/dashboard")
    await expect(page.getByText("Démonstration en lecture seule — données fictives", { exact: true })).toBeVisible()
    await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0)
    await page.reload()
    await expect(page.locator("#dashboard-main")).toBeVisible()
    await expect(page.getByText("Démonstration en lecture seule — données fictives", { exact: true })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe("/dashboard")
    expect(navigation).not.toContain("/auth/login")
    expect(callbacks).toEqual([{ path: "/api/auth/callback/demo", method: "POST", fields: ["callbackUrl", "csrfToken"] }])
    return { path: "public-visitor", callback: "POST /api/auth/callback/demo", credentialsRequested: false, sessionSurvivedReload: true }
  } finally {
    page.off("framenavigated", onNavigation)
    page.off("request", onRequest)
  }
}
