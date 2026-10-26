import { expect, it } from "vitest"
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { assertDemoDependencies } from "../../scripts/demo-runtime.mjs"

async function runtimeFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "freelio-runtime-qa-"))
  const lock = await readFile("package-lock.json", "utf8")
  const packages = JSON.parse(lock).packages as Record<string, { version?: string }>
  await writeFile(path.join(directory, "package-lock.json"), lock)
  // Only manifests are needed: no package or native binary is installed.
  for (const name of ["next", "react", "react-dom", "prisma", "@prisma/client", "@prisma/adapter-better-sqlite3", "better-sqlite3", "tsx"]) {
    const target = path.join(directory, "node_modules", name)
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, "package.json"), JSON.stringify({ name, version: packages[`node_modules/${name}`].version }))
  }
  return directory
}

it("accepts the locked runtime using only manifests and leaves the source untouched", async () => {
  const directory = await runtimeFixture()
  const before = await readdir(directory, { recursive: true })
  await expect(assertDemoDependencies(directory)).resolves.toBeUndefined()
  expect(await readdir(directory, { recursive: true })).toEqual(before)
})

it("refuses an older installed Next version instead of preparing a demo against another runtime", async () => {
  const directory = await runtimeFixture()
  await writeFile(path.join(directory, "node_modules/next/package.json"), JSON.stringify({ version: "0.0.0" }))
  await expect(assertDemoDependencies(directory)).rejects.toThrow(/next : version .* requise/)
  expect(await readdir(directory)).toEqual(["node_modules", "package-lock.json"])
})

it("reports missing and corrupt runtime manifests with an explicit manual repair", async () => {
  const directory = await runtimeFixture()
  await writeFile(path.join(directory, "node_modules/prisma/package.json"), "not JSON")
  await writeFile(path.join(directory, "node_modules/tsx/package.json"), "{}")
  const error = await assertDemoDependencies(directory).catch((value: Error) => value)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(/prisma : version .* requise/)
  expect((error as Error).message).toMatch(/tsx : version .* requise/)
  expect((error as Error).message).toContain("npm ci")
  expect((error as Error).message).toContain("n’installe aucun paquet")
})

it("refuses an unreadable lockfile and a lockfile without the runtime entry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "freelio-runtime-invalid-qa-"))
  await expect(assertDemoDependencies(directory)).rejects.toThrow(/lockfile/)
  await writeFile(path.join(directory, "package-lock.json"), "not JSON")
  await expect(assertDemoDependencies(directory)).rejects.toThrow(/lockfile/)
  await writeFile(path.join(directory, "package-lock.json"), JSON.stringify({ packages: {} }))
  await expect(assertDemoDependencies(directory)).rejects.toThrow(/Version de next absente/)
})
