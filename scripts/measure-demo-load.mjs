import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { performance } from "node:perf_hooks"
import { setTimeout as pause } from "node:timers/promises"
import { chromium, expect } from "@playwright/test"
import puppeteer from "puppeteer"

const origin = new URL(process.env.PUBLIC_APP_URL || "")
if (process.env.RECIPE_ISOLATED !== "true" || !["127.0.0.1", "localhost"].includes(origin.hostname)) throw Error("Serveur de charge local isolé requis")
const seconds = Number(process.env.LOAD_SECONDS || 1800)
if (!Number.isInteger(seconds) || seconds < 60 || seconds > 1800) throw Error("Durée bornée entre 60 et 1800 secondes")
if (!process.env.PUBLIC_DEMO_PASSWORD) throw Error("Mot de passe fictif requis")
const sessions = []
const browser = await chromium.launch({ executablePath: await puppeteer.executablePath() })
try {
  // Ten independent normal sessions. Documentation IPs stand for ten visitors
  // behind the future trusted proxy; this does not qualify that proxy itself.
  for (let index = 0; index < 10; index++) {
    const ip = `192.0.2.${index + 1}`
    const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } })
    await context.route("**/*", route => new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort())
    const page = await context.newPage()
    await page.goto(new URL("/auth/login", origin).href)
    await page.getByLabel("Adresse e-mail professionnelle").fill("direction@atelier-des-bassins.example.test")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.PUBLIC_DEMO_PASSWORD)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard")
    await expect(page.getByText("Démonstration en lecture seule — données fictives", { exact: true })).toBeVisible()
    const cookie = (await context.cookies()).filter(value => value.name.includes("session-token")).map(value => `${value.name}=${value.value}`).join("; ")
    assert(cookie)
    sessions.push({ cookie, ip })
    await context.close()
  }
} finally {
  await browser.close()
}
const routes = [
  "/dashboard", "/dashboard/clients", "/dashboard/devis", "/dashboard/factures", "/dashboard/service",
  "/dashboard/clients?view=" + encodeURIComponent(JSON.stringify({ page: 200 })),
  "/dashboard/clients?view=" + encodeURIComponent(JSON.stringify({ search: "Charge fictive 099" })),
  "/dashboard/clients?view=" + encodeURIComponent(JSON.stringify({ sort: { field: "revenue", direction: "desc" } })),
]
const results = new Map(routes.map(route => [route, { durations: [], failures: 0, bytes: 0, statuses: {} }]))
const failureSamples = []
const started = performance.now()
const deadline = started + seconds * 1000
let requests = 0
const progress = setInterval(() => console.log(JSON.stringify({ elapsedSeconds: Math.floor((performance.now() - started) / 1000), requests })), 60_000)
try {
  await Promise.all(sessions.map(async (session, index) => {
    let iteration = index
    while (performance.now() < deadline) {
      const route = routes[iteration++ % routes.length]
      const result = results.get(route)
      const begin = performance.now()
      try {
        const response = await fetch(new URL(route, origin), { headers: { cookie: session.cookie, "x-forwarded-for": session.ip }, redirect: "manual", signal: AbortSignal.timeout(10_000) })
        const body = await response.arrayBuffer()
        result.statuses[response.status] = (result.statuses[response.status] || 0) + 1
        if (response.status !== 200) {
          result.failures++
          if (failureSamples.length < 100) failureSamples.push({ route, elapsedSeconds: Math.floor((performance.now() - started) / 1000), status: response.status })
        }
        result.bytes += body.byteLength
      } catch (error) {
        result.failures++
        if (failureSamples.length < 100) failureSamples.push({ route, elapsedSeconds: Math.floor((performance.now() - started) / 1000), error: error.name })
      }
      result.durations.push(performance.now() - begin)
      requests++
      await pause(1000) // Fixed think time, measured throughput is reported.
    }
  }))
} finally {
  clearInterval(progress)
  const report = {
    schema: "freelio.local-load.v1", completedAt: new Date().toISOString(), node: process.version,
    machine: { platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemoryBytes: os.totalmem() },
    elapsedSeconds: (performance.now() - started) / 1000, sessions: 10, thinkTimeMs: 1000, requests,
    conditions: process.env.LOAD_CONDITIONS || "Conditions de charge du poste non renseignées",
    failureSamples,
    exclusions: ["Browser hydration and UI timings", "PDF rendering", "Distributed limiter and trusted reverse proxy", "Hosted network and R2", "Mixed 10,000 business dossiers: this corpus has 10,000 client records"],
    routes: [...results].map(([route, result]) => {
      const samples = result.durations.sort((a, b) => a - b)
      const percentile = value => samples[Math.max(0, Math.ceil(samples.length * value) - 1)] ?? null
      return { route, requests: samples.length, failures: result.failures, statuses: result.statuses, bytes: result.bytes, p50Ms: percentile(0.50), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: samples.at(-1) ?? null }
    }),
  }
  report.budgetPassed = report.routes.every(route => route.requests > 0 && route.failures === 0 && route.p95Ms < 800)
  await fs.mkdir(process.env.RECIPE_EVIDENCE_DIR, { recursive: true })
  await fs.writeFile(path.join(process.env.RECIPE_EVIDENCE_DIR, "load-demo.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ requests, budgetPassed: report.budgetPassed, routes: report.routes.map(({ route, p95Ms, failures }) => ({ route, p95Ms, failures })) }))
  if (!report.budgetPassed) process.exitCode = 1
}
