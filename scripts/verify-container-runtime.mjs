import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Creates only uniquely named containers and a private network. Never loads .env.
const image = process.argv[2]
if (!image || image.startsWith("-")) throw Error("Usage : node scripts/verify-container-runtime.mjs IMAGE_LOCALE")
const suffix = randomBytes(8).toString("hex")
const prefix = `freelio-recipe-${suffix}`
const database = `freelio_demo_linux_${suffix}`
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "Freelio-linux-"))
const password = randomBytes(32).toString("hex")
const secret = randomBytes(48).toString("hex")
const environmentFile = path.join(directory, "runtime.env")
const postgresFile = path.join(directory, "postgres.env")
fs.writeFileSync(postgresFile, `POSTGRES_USER=recipe\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 })
fs.writeFileSync(environmentFile, Object.entries({
  NODE_ENV: "production", DATABASE_URL: `postgresql://recipe:${password}@${prefix}-postgres:5432/${database}?schema=public`,
  AUTH_SECRET: secret, JWT_SECRET: secret, ENCRYPTION_KEY: randomBytes(32).toString("hex"), CONSENT_TOKEN_SECRET: secret, LEAD_HASH_SALT: secret,
  LEAD_INGEST_SECRET: secret, AUTOMATION_CRON_SECRET: secret, CRON_SECRET: secret, LEAD_ALLOWED_ORIGINS: "https://example.test",
  REDIS_URL: `redis://${prefix}-redis:6379`, FILE_STORAGE_DRIVER: "local", MIGRATION_STORAGE_DRIVER: "local",
  RECIPE_ISOLATED: "true", DEMO_DATABASE_NAME: database, DEMO_PASSWORD: `DemoA9-${password}`,
  AUTH_URL: "https://example.test", PUBLIC_APP_URL: "https://example.test", NEXT_TELEMETRY_DISABLED: "1",
  PUBLIC_PRIVACY_NOTICE_URL: "https://example.test/privacy", UPSTASH_REDIS_REST_URL: "https://limiter.example.test", UPSTASH_REDIS_REST_TOKEN: secret,
}).map(([key, value]) => `${key}=${value}\n`).join(""), { mode: 0o600 })
const report = { schema: "freelio.container-recipe.v1", startedAt: new Date().toISOString(), image, checks: [] }
const containers = []
let networkCreated = false
function docker(args, allowFailure = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    if (allowFailure) return undefined
    // No command arguments or environment values in errors.
    const output = `${result.stdout || ""}${result.stderr || ""}`.replaceAll(password, "[redacted]").replaceAll(secret, "[redacted]")
    throw Error(`Échec de la recette Docker : ${output.slice(-3000)}`)
  }
  return result.stdout.trim()
}
function runRuntime(command, extra = []) {
  return docker(["run", "--rm", "--network", prefix, "--env-file", environmentFile, ...extra, image, ...command])
}
try {
  report.imageId = docker(["image", "inspect", image, "--format", "{{.Id}}"])
  const invalid = spawnSync("docker", ["run", "--rm", "--network", "none", image], { encoding: "utf8", timeout: 30_000, windowsHide: true })
  assert.equal(invalid.status, 1, "La configuration vide doit refuser le démarrage")
  assert.match(invalid.stderr || "", /Configuration de production incomplète/)
  report.checks.push("Configuration de production vide refusée avant écoute")
  docker(["network", "create", "--internal", prefix]); networkCreated = true
  for (const [kind, source, options] of [
    ["postgres", "postgres:18.6-bookworm", ["--env-file", postgresFile]],
    ["redis", "redis:7.4-bookworm", []],
  ]) {
    const name = `${prefix}-${kind}`
    docker(["run", "--detach", "--name", name, "--network", prefix, ...options, source])
    containers.push(name)
  }
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker(["exec", `${prefix}-postgres`, "pg_isready", "-U", "recipe", "-d", database], true)) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert.ok(ready, "PostgreSQL doit démarrer")
  runRuntime(["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"])
  report.checks.push("43 migrations sur PostgreSQL Linux neuf")
  runRuntime(["node", "--import", "tsx", "scripts/seed-demo.mjs"], ["--env", "NODE_ENV=test"])
  report.checks.push("Données fictives créées par Prisma Linux")
  const web = `${prefix}-web`
  // Fake provider configuration on an internal network: probes exercise SQL and
  // startup validation, not R2/Upstash availability or a real TLS reverse proxy.
  docker(["run", "--detach", "--name", web, "--network", prefix, "--env-file", environmentFile,
    "--env", "FILE_STORAGE_DRIVER=r2", "--env", "MIGRATION_STORAGE_DRIVER=r2", "--env", "R2_ACCOUNT_ID=00000000000000000000000000000000",
    "--env", "R2_BUCKET_NAME=recipe", "--env", "R2_ACCESS_KEY_ID=recipe", "--env", "R2_SECRET_ACCESS_KEY=recipe", image])
  containers.push(web)
  const healthProbe = "Promise.all(['/api/health/live','/api/health/ready'].map(async route=>{const response=await fetch('http://127.0.0.1:3000'+route);if(response.status!==200)process.exitCode=1})).catch(()=>process.exitCode=1)"
  let healthy = false
  for (let attempt = 0; attempt < 30; attempt++) {
    if (docker(["exec", web, "node", "-e", healthProbe], true) !== undefined) { healthy = true; break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert.ok(healthy, "Sondes live/ready du runtime Linux requises")
  report.checks.push("Serveur Linux et sondes live/ready avec SQL réel")
  docker(["stop", "--time", "35", web])
  // Installed Next.js finishes its cleanup with the conventional 128+SIGTERM
  // code (143); a forced Docker kill would return 137 instead.
  assert.equal(docker(["inspect", web, "--format", "{{.State.ExitCode}}"]), "143", "Arrêt Next.js sur SIGTERM requis")
  report.checks.push("Serveur arrêté sur SIGTERM sans kill forcé (code Next.js 143)")
  const worker = `${prefix}-worker`
  docker(["run", "--detach", "--name", worker, "--network", prefix, "--env-file", environmentFile, image, "node", "--conditions=react-server", "--import", "tsx", "scripts/start-worker.mjs"])
  containers.push(worker)
  const probe = runRuntime(["node", "--conditions=react-server", "--import", "tsx", "scripts/verify-runtime-database.mjs"])
  report.database = JSON.parse(probe.split("\n").findLast(line => line.startsWith("{")))
  report.checks.push("Worker BullMQ connecté à Redis, PDF de devis terminé")
  docker(["stop", "--time", "35", worker])
  const exitCode = docker(["inspect", worker, "--format", "{{.State.ExitCode}}"])
  assert.equal(exitCode, "0", "Arrêt gracieux du worker requis")
  report.checks.push("Worker arrêté proprement sur SIGTERM")
  const pdf = docker(["run", "--rm", "--network", "none", image, "node", "--conditions=react-server", "--import", "tsx", "scripts/verify-runtime-pdf.mjs"])
  report.pdf = JSON.parse(pdf.split("\n").findLast(line => line.startsWith("{")))
  report.checks.push("PDF Chromium hors réseau sous utilisateur runtime")
  report.success = true
  report.exclusions = ["Disponibilité réelle R2/Upstash", "TLS, reverse proxy et réseau hébergé", "Reprise après interruption d’un job actif", "Validation SaaS commerciale"]
} finally {
  for (const container of containers.reverse()) docker(["rm", "--force", "--volumes", container], true)
  if (networkCreated) docker(["network", "rm", prefix], true)
  // Only two exact secret files created above are removed; evidence is preserved.
  fs.unlinkSync(environmentFile); fs.unlinkSync(postgresFile)
  report.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(directory, "verification.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checksPassed: report.checks.length, success: report.success === true, evidence: path.join(directory, "verification.json") }))
}
