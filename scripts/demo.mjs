import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import net from "node:net"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import { acquireDemoLock } from "./demo-lock.mjs"

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const resumeIndex = args.indexOf("--resume")
const portIndex = args.indexOf("--port")
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 54177
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port local invalide")
if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node 24.x requis")
await fs.access(path.join(source, "node_modules", "next", "dist", "bin", "next"))
await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once("error", reject)
  probe.listen(port, "127.0.0.1", () => probe.close(resolve))
})
const parent = path.join(os.tmpdir(), "Freelio-local-demo")
await fs.mkdir(parent, { recursive: true })
const runtime = resumeIndex >= 0 ? path.resolve(args[resumeIndex + 1]) : await fs.mkdtemp(path.join(parent, "demo-"))
const releaseOperation = await acquireDemoLock(runtime, "SERVER")
try {
  const accessFile = path.join(runtime, "demo-access.json")
  let access
  if (resumeIndex >= 0) {
    access = JSON.parse(await fs.readFile(accessFile, "utf8"))
    if (access.schema !== "freelio.local-demo.v1" || !access.authSecret || !access.encryptionKey || !access.password) throw new Error("Ce dossier n’est pas une démo Freelio préparée")
  } else {
    access = {
      schema: "freelio.local-demo.v1", email: "direction@atelier-des-bassins.example.test",
      password: process.env.DEMO_PASSWORD || randomBytes(18).toString("base64url"),
      authSecret: randomBytes(48).toString("hex"), encryptionKey: randomBytes(32).toString("hex"),
    }
    if (access.password.length < 12) throw new Error("DEMO_PASSWORD doit contenir au moins 12 caractères")
    await fs.writeFile(accessFile, JSON.stringify(access, null, 2), { flag: "wx", mode: 0o600 })
  }

  // Copy versioned and current source files, never the project's data or env files.
  const files = execFileSync("git", ["-C", source, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0")
  for (const name of new Set(files)) {
    if (!name || /(^|\/)\.env|^(data|uploads|generated|node_modules|\.auth)(\/|$)|\.db($|-)/.test(name)) continue
    const origin = path.resolve(source, name), target = path.resolve(runtime, name)
    if (!origin.startsWith(source + path.sep) || !target.startsWith(runtime + path.sep)) throw new Error("Chemin de copie hors démo")
    const info = await fs.stat(origin).catch(() => null)
    if (!info?.isFile()) continue
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(origin, target)
  }
  // Reuse installed dependencies; neither install nor regenerate them here.
  const modules = path.join(runtime, "node_modules")
  if (!(await fs.lstat(modules).catch(() => null))) await fs.symlink(path.join(source, "node_modules"), modules, process.platform === "win32" ? "junction" : "dir")
  const baseURL = `http://127.0.0.1:${port}`
  const env = {
    SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: runtime, TMP: runtime,
    NODE_ENV: "development", DATABASE_URL: `file:${path.join(runtime, "demo.db").replaceAll("\\", "/")}`,
    AUTH_SECRET: access.authSecret, ENCRYPTION_KEY: access.encryptionKey, AUTH_URL: baseURL, NEXTAUTH_URL: baseURL,
    PUBLIC_APP_URL: baseURL, FILE_STORAGE_DRIVER: "local", NEXT_PUBLIC_DEMO_MODE: "true",
    DEMO_PASSWORD: access.password, NEXT_TELEMETRY_DISABLED: "1", CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1", PUPPETEER_CACHE_DIR: path.join(os.homedir(), ".cache", "puppeteer"),
    NODE_OPTIONS: `--require ${JSON.stringify(path.join(runtime, "scripts", "demo-network.cjs"))}`,
  }
  function redact(output) {
    let text = output.toString()
    for (const value of [access.password, access.authSecret, access.encryptionKey]) text = text.replaceAll(value, "[redacted]")
    return text.split("\n").map(line => /bearer|authorization|magic link/i.test(line) ? "[sensitive diagnostic redacted]" : line).join("\n")
  }
  async function run(script, arguments_ = []) {
    const child = spawn(process.execPath, [script, ...arguments_], { cwd: runtime, env, stdio: ["inherit", "pipe", "pipe"], windowsHide: true })
    function forward(stream, output) {
      let pending = ""
      stream.setEncoding("utf8")
      stream.on("data", chunk => {
        pending += chunk
        let end
        while ((end = pending.indexOf("\n")) >= 0) {
          output.write(redact(pending.slice(0, end + 1)))
          pending = pending.slice(end + 1)
        }
      })
      stream.on("end", () => { if (pending) output.write(redact(pending)) })
    }
    forward(child.stdout, process.stdout)
    forward(child.stderr, process.stderr)
    const stop = () => child.kill()
    process.once("SIGINT", stop)
    try {
      const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve) })
      if (code !== 0 && code !== null) throw new Error(`La commande de démo a échoué (${code})`)
    } finally { process.removeListener("SIGINT", stop) }
  }
  await run(path.join(modules, "prisma", "build", "index.js"), ["db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"])
  if (resumeIndex < 0) await run(path.join(modules, "tsx", "dist", "cli.mjs"), [path.join(runtime, "scripts", "seed-demo.mjs")])
  console.log(`Démo locale : ${baseURL}\nDossier : ${runtime}\nIdentifiants fictifs : ${accessFile}\nArrêt : Ctrl+C. Aucun .env ni donnée du projet utilisés.`)
  if (!args.includes("--prepare")) {
    const runningFile = path.join(runtime, "demo-running.json")
    await fs.writeFile(runningFile, JSON.stringify({ pid: process.pid, port }), { flag: "wx" })
    try { await run(path.join(modules, "next", "dist", "bin", "next"), ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)]) }
    finally { await fs.rm(runningFile, { force: true }) }
  }
} finally {
  await releaseOperation()
}
