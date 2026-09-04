import { expect, test, type Page } from "@playwright/test"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

type Severity = "P0" | "P1" | "P2" | "P3"

type Finding = {
  severity: Severity
  category: "accessibility" | "content" | "performance" | "responsive" | "runtime"
  route: string
  message: string
}

type PageAudit = {
  duplicateIds: string[]
  h1Count: number
  lowContrast: string[]
  overflow: string[]
  smallTargets: string[]
  unlabeledControls: string[]
}

async function staticDashboardRoutes() {
  const root = path.join(process.cwd(), "src", "app", "dashboard")
  const entries = await readdir(root, { recursive: true })

  return entries
    .filter((entry) => entry === "page.tsx" || entry.endsWith(`${path.sep}page.tsx`))
    .filter((entry) => !entry.includes("["))
    .map((entry) => {
      if (entry === "page.tsx") return "/dashboard"
      const segment = entry.replaceAll(path.sep, "/").replace(/\/page\.tsx$/, "")
      return `/dashboard/${segment}`
    })
    .sort()
}

async function settlePage(page: Page) {
  await page.locator("#dashboard-main").waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined)
  await page.waitForFunction(
    () => document.title !== "Freelio - CRM pour piscinistes",
    undefined,
    { timeout: 3_000 },
  ).catch(() => undefined)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.waitForFunction(() => {
    const heading = document.querySelector("#dashboard-main h1")?.textContent?.trim().replace(/\s+/g, " ")
    return Boolean(heading && document.title.includes(heading.slice(0, 24)))
  }, undefined, { timeout: 3_000 }).catch(() => undefined)
}

async function auditPage(page: Page, mobile: boolean): Promise<PageAudit> {
  return page.evaluate((isMobile) => {
    const visible = (element: Element) => {
      const htmlElement = element as HTMLElement
      const style = getComputedStyle(htmlElement)
      const rect = htmlElement.getBoundingClientRect()
      return !htmlElement.closest("[aria-hidden=true]")
        && !htmlElement.classList.contains("sr-only")
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0
    }

    const label = (element: Element) => {
      const htmlElement = element as HTMLElement
      const text = htmlElement.innerText?.trim() || htmlElement.textContent?.trim() || ""
      return text.replace(/\s+/g, " ").slice(0, 90)
        || htmlElement.getAttribute("aria-label")
        || htmlElement.getAttribute("name")
        || htmlElement.tagName.toLowerCase()
    }

    const hasAccessibleName = (element: Element) => {
      const htmlElement = element as HTMLElement
      const ariaLabel = htmlElement.getAttribute("aria-label")?.trim()
      if (ariaLabel) return true

      const labelledBy = htmlElement.getAttribute("aria-labelledby")
      if (labelledBy?.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())) return true
      if (htmlElement.getAttribute("title")?.trim()) return true
      if (htmlElement.textContent?.trim()) return true

      const id = htmlElement.id
      if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim()) return true
      if (htmlElement.closest("label")?.textContent?.trim()) return true

      if (htmlElement instanceof HTMLInputElement) {
        if (["button", "image", "reset", "submit"].includes(htmlElement.type) && htmlElement.value.trim()) return true
        if (htmlElement.labels && Array.from(htmlElement.labels).some((item) => item.textContent?.trim())) return true
      }

      return false
    }

    type Color = { red: number; green: number; blue: number; alpha: number }
    const colorCanvas = document.createElement("canvas")
    colorCanvas.width = 1
    colorCanvas.height = 1
    const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true })
    const parseColor = (value: string): Color | null => {
      if (!colorContext) return null
      colorContext.clearRect(0, 0, 1, 1)
      colorContext.fillStyle = value
      colorContext.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data
      return { red, green, blue, alpha: alpha / 255 }
    }

    const relativeLuminance = (red: number, green: number, blue: number) => {
      const channels = [red, green, blue].map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }

    const composite = (foreground: Color, background: Color): Color => {
      const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha)
      if (alpha === 0) return { red: 255, green: 255, blue: 255, alpha: 1 }
      return {
        red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
        green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
        blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
        alpha,
      }
    }

    const backgroundFor = (element: Element): Color | null => {
      let current: Element | null = element
      let foregroundLayer: Color = { red: 0, green: 0, blue: 0, alpha: 0 }

      while (current) {
        const style = getComputedStyle(current)
        const parsed = parseColor(style.backgroundColor)
        if (parsed && parsed.alpha > 0) {
          foregroundLayer = composite(foregroundLayer, parsed)
          if (foregroundLayer.alpha >= 0.99) return foregroundLayer
        }

        // A gradient or image cannot be sampled reliably from computed styles.
        // Skip the automated contrast assertion instead of reporting a false positive.
        if (style.backgroundImage !== "none") return null
        current = current.parentElement
      }

      return composite(foregroundLayer, { red: 255, green: 255, blue: 255, alpha: 1 })
    }

    const contrastRatio = (foreground: Color | null, background: Color | null) => {
      if (!foreground || !background) return null
      const opaqueForeground = composite(foreground, background)
      const foregroundLuminance = relativeLuminance(opaqueForeground.red, opaqueForeground.green, opaqueForeground.blue)
      const backgroundLuminance = relativeLuminance(background.red, background.green, background.blue)
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    }

    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]"))
      .map((element) => element.id)
      .filter(Boolean)
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]

    const controls = Array.from(document.querySelectorAll(
      "button, input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=combobox], [role=switch]"
    )).filter(visible)
    const unlabeledControls = controls.filter((element) => !hasAccessibleName(element)).map(label).slice(0, 20)

    const scrollContainer = document.querySelector("#dashboard-main")
    const viewportWidth = document.documentElement.clientWidth
    const canScrollHorizontally = (element: Element) => {
      let current = element.parentElement
      while (current && current !== scrollContainer) {
        const overflowX = getComputedStyle(current).overflowX
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") return true
        current = current.parentElement
      }
      return false
    }
    const overflow = scrollContainer
      ? Array.from(scrollContainer.querySelectorAll<HTMLElement>("article, aside, div, fieldset, footer, form, header, nav, section, table"))
          .filter(visible)
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            return (rect.left < -2 || rect.right > viewportWidth + 2) && !canScrollHorizontally(element)
          })
          .map(label)
          .filter((value, index, values) => values.indexOf(value) === index)
          .slice(0, 20)
      : ["Contenu principal absent"]

    // An empty table is not tabular data: its explanation/action must never require
    // sideways scrolling, even when the table intentionally allows it for rows.
    for (const empty of document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]')) {
      if (!visible(empty)) continue
      const rect = empty.getBoundingClientRect()
      if (rect.left < -2 || rect.right > viewportWidth + 2) overflow.push(`État vide hors écran : ${label(empty)}`)
    }

    const targetElements = Array.from(document.querySelectorAll<HTMLElement>(
      "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button]"
    )).filter(visible)
    const smallTargets = isMobile
      ? targetElements
          .filter((element) => {
            if (getComputedStyle(element).display === "inline") return false
            const effectiveTarget = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
              ? element.closest("label") ?? element
              : element
            const rect = effectiveTarget.getBoundingClientRect()
            return rect.width < 24 || rect.height < 24
          })
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return `${label(element)} [${element.tagName.toLowerCase()} ${Math.round(rect.width)}×${Math.round(rect.height)}]`
          })
          .filter((value, index, values) => values.indexOf(value) === index)
          .slice(0, 20)
      : []

    const textElements = Array.from(scrollContainer?.querySelectorAll<HTMLElement>(
      "a, button, dd, dt, h1, h2, h3, h4, label, legend, li, p, span, td, th"
    ) ?? []).filter(visible)
    const lowContrast = textElements
      .filter((element) => !element.matches(":disabled, [aria-disabled=true]") && !element.closest("[aria-disabled=true]"))
      .flatMap((element) => {
        const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90)
        if (!text || text.length > 90 || element.children.length > 3) return []
        const style = getComputedStyle(element)
        const foreground = parseColor(style.color)
        const background = backgroundFor(element)
        const ratio = contrastRatio(foreground, background)
        if (ratio === null) return []
        const fontSize = Number.parseFloat(style.fontSize)
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400
        const threshold = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5
        const context = [element.tagName.toLowerCase(), element.getAttribute("data-slot"), element.className]
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .join(" · ")
          .slice(0, 180)
        return ratio + 0.05 < threshold ? [`${text} (${ratio.toFixed(2)}:1) [${context}]`] : []
      })
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 30)

    return {
      duplicateIds,
      h1Count: Array.from(document.querySelectorAll("#dashboard-main h1"))
        .filter((heading) => !heading.closest("[contenteditable=true], [role=document]"))
        .length,
      lowContrast,
      overflow,
      smallTargets,
      unlabeledControls,
    }
  }, mobile)
}

test("audit UI exhaustif des routes authentifiées", async ({ page }, testInfo) => {
  test.skip(process.env.E2E_FULL_UI_AUDIT !== "true", "Audit exhaustif déclenché séparément")
  test.setTimeout(15 * 60_000)

  const mobile = testInfo.project.name === "mobile"
  const artifactDirectory = path.join(process.cwd(), "test-results", "full-ui-audit", testInfo.project.name)
  await mkdir(artifactDirectory, { recursive: true })

  const findings: Finding[] = []
  const titles = new Map<string, string[]>()
  const routes = await staticDashboardRoutes()
  const queue = [...routes]
  const visited = new Set<string>()
  const evidence: Array<{ route: string } & Awaited<ReturnType<typeof captureScrollablePage>>> = []
  let currentRoute = "/dashboard"

  page.on("console", (message) => {
    if (message.type() === "error") {
      findings.push({ severity: "P1", category: "runtime", route: currentRoute, message: message.text() })
    }
  })
  page.on("pageerror", (error) => {
    findings.push({ severity: "P0", category: "runtime", route: currentRoute, message: error.message })
  })

  while (queue.length > 0 && visited.size < 90) {
    const requestedRoute = queue.shift()
    if (!requestedRoute || visited.has(requestedRoute)) continue
    visited.add(requestedRoute)
    currentRoute = requestedRoute

    const response = await page.goto(requestedRoute, { waitUntil: "domcontentloaded" })
    if (!response || response.status() >= 400) {
      findings.push({
        severity: "P0",
        category: "runtime",
        route: requestedRoute,
        message: `Réponse HTTP ${response?.status() ?? "absente"}`,
      })
      continue
    }

    if (!new URL(page.url()).pathname.startsWith("/dashboard")) {
      findings.push({ severity: "P0", category: "runtime", route: requestedRoute, message: `Redirection vers ${page.url()}` })
      continue
    }

    await settlePage(page)
    const actualRoute = new URL(page.url()).pathname
    currentRoute = actualRoute
    if (!routes.includes(actualRoute)) {
      await page.waitForFunction(() => {
        const heading = document.querySelector("#dashboard-main h1")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80)
        return Boolean(heading && document.title.startsWith(heading))
      }, undefined, { timeout: 2_000 }).catch(() => undefined)
    }
    const title = await page.title()
    titles.set(title, [...(titles.get(title) ?? []), actualRoute])

    const audit = await auditPage(page, mobile)
    if (audit.h1Count !== 1) {
      findings.push({ severity: "P1", category: "accessibility", route: actualRoute, message: `${audit.h1Count} titre(s) h1 dans le contenu principal` })
    }
    for (const id of audit.duplicateIds) {
      findings.push({ severity: "P1", category: "accessibility", route: actualRoute, message: `Identifiant HTML dupliqué : ${id}` })
    }
    for (const control of audit.unlabeledControls) {
      findings.push({ severity: "P1", category: "accessibility", route: actualRoute, message: `Contrôle sans nom accessible : ${control}` })
    }
    for (const element of audit.overflow) {
      findings.push({ severity: "P1", category: "responsive", route: actualRoute, message: `Débordement horizontal non contenu : ${element}` })
    }
    for (const element of audit.smallTargets) {
      findings.push({ severity: "P2", category: "responsive", route: actualRoute, message: `Cible tactile inférieure à 24 px : ${element}` })
    }
    for (const element of audit.lowContrast) {
      findings.push({ severity: "P1", category: "accessibility", route: actualRoute, message: `Contraste insuffisant : ${element}` })
    }

    const discoveredRoutes = await page.locator('a[href^="/dashboard"]').evaluateAll((links) => links.map((link) => {
      const url = new URL((link as HTMLAnchorElement).href)
      return url.pathname
    }))
    for (const route of discoveredRoutes) {
      if (!visited.has(route) && !queue.includes(route)) queue.push(route)
    }

    const fileName = actualRoute.replace(/^\/dashboard\/?/, "").replaceAll("/", "--") || "overview"
    const capture = await captureScrollablePage(page, artifactDirectory, fileName)
    evidence.push({ route: actualRoute, ...capture })
    if (!capture.complete) findings.push({ severity: "P2", category: "content", route: actualRoute, message: "Capture interrompue après 40 écrans : contenu restant non inspecté" })
  }

  for (const [title, titleRoutes] of titles) {
    const uniqueRoutes = [...new Set(titleRoutes)]
    if (uniqueRoutes.length > 1) {
      findings.push({
        severity: "P2",
        category: "content",
        route: uniqueRoutes.join(", "),
        message: `Titre de document non spécifique partagé par ${uniqueRoutes.length} pages : ${title}`,
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    project: testInfo.project.name,
    routesAudited: [...visited],
    evidence,
    summary: {
      P0: findings.filter((finding) => finding.severity === "P0").length,
      P1: findings.filter((finding) => finding.severity === "P1").length,
      P2: findings.filter((finding) => finding.severity === "P2").length,
      P3: findings.filter((finding) => finding.severity === "P3").length,
    },
    findings,
  }
  await writeFile(path.join(artifactDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")

  expect(findings.filter((finding) => finding.severity !== "P3")).toEqual([])
})
