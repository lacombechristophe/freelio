import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const url = new URL(process.env.DATABASE_URL || "")
if (process.env.RECIPE_ISOLATED !== "true" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username !== "freelio_demo_reader" || !url.pathname.startsWith("/freelio_demo_")) throw Error("Le rôle lecteur et la base fictive locale sont requis")
const client = new PrismaClient()
const checks = []
try {
  const [role] = await client.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = current_user`
  assert(Object.values(role).every(value => value === false))
  await client.$queryRaw`SELECT count(*) FROM "Company"`
  checks.push("SELECT allowed; superuser, createdb, createrole, replication and bypassrls disabled")
  for (const sql of [
    'UPDATE "Company" SET "name" = "name" WHERE false',
    'DELETE FROM "Company" WHERE false',
    'INSERT INTO "Company" SELECT * FROM "Company" WHERE false',
    'DELETE FROM "AuditLog" WHERE false',
    'CREATE TABLE public.reader_forbidden_test (id int)',
  ]) {
    let denied = false
    try { await client.$executeRawUnsafe(sql) } catch (error) { denied = error?.meta?.code === "42501" }
    assert(denied, "Une opération interdite n’a pas été refusée par PostgreSQL")
    checks.push(sql.split(" ")[0] + " refused by PostgreSQL (42501)")
  }
  const [audit] = await client.$queryRaw`SELECT has_table_privilege(current_user, 'public."AuditLog"', 'INSERT') AS permitted`
  assert.equal(audit.permitted, true)
  checks.push("Audit event append permitted")
  const directory = process.env.RECIPE_EVIDENCE_DIR
  if (directory) {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, "public-demo-db-role.json"), JSON.stringify({ completedAt: new Date().toISOString(), checks }, null, 2))
  }
  console.log(JSON.stringify({ checksPassed: checks.length }))
} catch {
  console.error("Vérification des droits SQL de démonstration échouée")
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
