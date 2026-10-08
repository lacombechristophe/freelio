import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { ESLint, RuleTester, type Rule } from "eslint"
import globals from "globals"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import baseline from "../../tooling/lint/baseline-rules.json"
import cases from "../../tooling/lint/next-rule-cases.json"
import locationRule from "../../tooling/lint/no-location-assign-relative-destination.mjs"

const root = process.cwd()
const nativeConfig = JSON.parse(fs.readFileSync(path.join(root, ".oxlintrc.json"), "utf8"))
const recipe = fs.mkdtempSync(path.join(os.tmpdir(), "Freelio-lint-policy-"))
afterAll(() => {
  if (path.dirname(path.resolve(recipe)) !== path.resolve(os.tmpdir()) || !path.basename(recipe).startsWith("Freelio-lint-policy-")) throw new Error("Unexpected lint recipe path")
  fs.rmSync(recipe, { recursive: true, force: true })
})
const eslint = new ESLint({ cwd: root })
// Loading the complete plugin configuration is setup, not a policy assertion.
// A cold Windows installation took 20 seconds; individual checks keep 5 seconds.
beforeAll(() => eslint.calculateConfigForFile(baseline.samples[0]), 30_000)

describe("lint policy survives removal of the vulnerable Next plugin dependency", () => {
  it.each(baseline.samples)("preserves every configured severity and option for %s", async file => {
    const actual = (await eslint.calculateConfigForFile(file)).rules
    const combined: Record<string, unknown> = { ...actual }
    for (const [rule, value] of Object.entries(nativeConfig.rules)) {
      const [level, ...options] = value as [string, ...unknown[]]
      combined[rule.replace("nextjs/", "@next/next/")] = [["off", "warn", "error"].indexOf(level), ...options]
    }
    const expected = { ...baseline.commonRules, ...(file.endsWith(".ts") || file.endsWith(".tsx") ? baseline.typescriptOverrides : {}) }
    expect(combined).toEqual(Object.fromEntries(Object.entries(expected).map(([rule, value]) => [rule, Array.isArray(value) ? value : [value]])))
  })
  it.each(cases)("detects the pre-migration Next sentinel: $rule", ({ rule, file, code, expected }) => {
    const destination = path.join(recipe, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, code)
    const route = path.join(recipe, "pages/dashboard/index.tsx")
    fs.mkdirSync(path.dirname(route), { recursive: true })
    fs.writeFileSync(route, "export default function Page(){return <div/>}")
    const output = spawnSync(process.execPath, [path.join(root, "node_modules/oxlint/bin/oxlint"), "--config", path.join(root, ".oxlintrc.json"), "--format=json", file], { cwd: recipe, encoding: "utf8" })
    expect(output.error).toBeUndefined()
    const report = JSON.parse(output.stdout)
    expect(report.diagnostics.filter((row: { code: string }) => row.code === `next(${rule})`)).toHaveLength(expected)
    expect(expected).toBe(1)
  })
  it("accepts a file without a Next violation and a download handled by an attachment route", () => {
    const file = path.join(recipe, "valid.tsx")
    fs.writeFileSync(file, 'export default function Page(){return <a download href="/api/backup/export">Export</a>}')
    const output = spawnSync(process.execPath, [path.join(root, "node_modules/oxlint/bin/oxlint"), "--config", path.join(root, ".oxlintrc.json"), "--format=json", file], { cwd: recipe, encoding: "utf8" })
    expect(output.status).toBe(0)
    expect(JSON.parse(output.stdout).diagnostics).toEqual([])
  })
  it("requires both engines from the normal npm lint command", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    expect(pkg.scripts.lint).toBe("eslint . && oxlint .")
    expect(nativeConfig.categories).toEqual({ correctness: "off" })
    expect(Object.keys(nativeConfig.rules)).toHaveLength(21)
  })
})

RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.browser } })
tester.run("retained Next relative navigation rule", locationRule as Rule.RuleModule, {
  valid: [
    'location.assign("https://example.test/page")',
    'window.location.href = "//example.test/page"',
    'location.assign(destination)',
    'function navigate(location){location.assign("/page")}',
    'const window = { location: {} }; window.location.href = "/page"',
    'let destination = "/page"; destination = "https://example.test"; location.assign(destination)',
  ],
  invalid: [
    'location.assign("/page")',
    'window.location.href = "/page"',
    'globalThis.location["assign"]("/page")',
    'self.location.href = "/page"',
    'document.location.href = "/page"',
    'location.assign(`/page/${identifier}`)',
    'location.assign("/page/" + identifier)',
    'const destination = "/page"; location.assign(destination)',
    'let destination = "https://example.test"; destination = "/page"; location.assign(destination)',
  ].map(code => ({ code, errors: [{ messageId: "noLocationAssign" }] })),
})
