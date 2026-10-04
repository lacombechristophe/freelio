import { afterAll, expect, it } from "vitest"
import { PrismaClient } from "@prisma/client"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import os from "node:os"

let database: PrismaClient | undefined
afterAll(async () => { await database?.$disconnect() })

it.skipIf(!process.env.DATABASE_URL?.startsWith("file:"))("restores a native SQLite demo snapshot with unchanged IDs, amounts and attached file bytes, and rejects tampering", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "demo-native-qa-"))
  const databasePath = path.join(directory, "demo.db")
  const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: directory, TMP: directory, NODE_ENV: "test" as const, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`, CHECKPOINT_DISABLE: "1", NODE_OPTIONS: process.env.NODE_OPTIONS }
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"], { env, stdio: "pipe", timeout: 30_000 })
  database = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })
  const company = await database.company.create({ data: { name: "Synthetic native restore" } })
  const user = await database.user.create({ data: { email: company.id + "@example.test", companyId: company.id } })
  await database.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
  const client = await database.client.create({ data: { companyId: company.id, name: "Synthetic restored client" } })
  const invoice = await database.invoice.create({ data: { companyId: company.id, clientId: client.id, number: "DEMO-NATIVE-001", object: "Synthetic document", dueDate: new Date("2026-10-30T00:00:00Z"), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, lines: { create: { label: "Synthetic line", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } })
  const bytes = Buffer.from("Fictitious attachment for the native restoration exercise")
  const fileKey = `${company.id}/client/${client.id}/proof.txt`
  const file = await database.clientFile.create({ data: { clientId: client.id, name: "proof.txt", url: fileKey, type: "text/plain", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } })
  await mkdir(path.join(directory, "data", "files", path.dirname(fileKey)), { recursive: true })
  await writeFile(path.join(directory, "data", "files", fileKey), bytes)
  const draft = await database.emailDraft.create({ data: { companyId: company.id, authorUserId: user.id, createKey: randomUUID(), requestKey: randomUUID(), subject: "Private fictional draft", bodyHtml: "<p>Fictional content only</p>", cc: [], bcc: [] } })
  const signature = await database.emailSignature.create({ data: { companyId: company.id, authorUserId: user.id, text: "Private fictional signature", version: 3 } })
  const privateBytes = Buffer.from("%PDF-private fictional draft file")
  const privateKey = `private/${company.id}/email-draft/${draft.id}/proof.pdf`
  const scheduledContact = await database.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test" } })
  const scheduledChannel = await database.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, visibility: "PRIVATE", provider: "RESEND", emailAddress: "sender@example.test", status: "ACTIVE" } })
  const privateAttachments = [{ id: randomUUID(), name: "proof.pdf", size: privateBytes.length, type: "application/pdf", sha256: createHash("sha256").update(privateBytes).digest("hex"), relativePath: `local:${privateKey}` }]
  const privateDraft = await database.emailDraft.update({ where: { id: draft.id }, data: { attachments: privateAttachments,
    contactId: scheduledContact.id, channelId: scheduledChannel.id, scheduledAt: new Date("2026-10-30T12:00:00Z"), scheduledTimezone: "Europe/Paris", scheduleStatus: "QUEUED", scheduleNextAttemptAt: new Date("2026-10-30T12:00:00Z"),
    scheduledPayload: { provider: "RESEND", payload: { userId: user.id, contactId: scheduledContact.id, clientId: client.id, channelId: scheduledChannel.id, companyName: company.name,
      from: "sender@example.test", to: scheduledContact.email, subject: draft.subject, html: draft.bodyHtml, text: "Fictional content only", cc: [], bcc: [], attachments: privateAttachments, threadId: null, serviceTicketId: null, replyTo: null } },
  } })
  await mkdir(path.join(directory, "data", "files", path.dirname(privateKey)), { recursive: true })
  await writeFile(path.join(directory, "data", "files", privateKey), privateBytes)
  await writeFile(path.join(directory, "demo-access.json"), JSON.stringify({ schema: "freelio.local-demo.v1", authSecret: "synthetic-auth", encryptionKey: "synthetic-encryption", password: "synthetic-password" }))
  const before = await database.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } })
  const backup = JSON.parse(execFileSync(process.execPath, ["scripts/backup-demo.mjs", "--dir", directory], { env, encoding: "utf8", timeout: 30_000 }))
  const restored = JSON.parse(execFileSync(process.execPath, ["scripts/backup-demo.mjs", "--restore", backup.backupDirectory], { env, encoding: "utf8", timeout: 30_000 }))
  const recovered = new PrismaClient({ datasources: { db: { url: `file:${path.join(restored.restoredDirectory, "demo.db").replaceAll("\\", "/")}` } } })
  try {
    expect(await recovered.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } })).toEqual(before)
    expect(await recovered.clientFile.findUniqueOrThrow({ where: { id: file.id } })).toEqual(file)
    expect(await recovered.membership.count({ where: { companyId: company.id, userId: user.id } })).toBe(1)
    expect(await readFile(path.join(restored.restoredDirectory, "data", "files", fileKey))).toEqual(bytes)
    expect(await recovered.emailDraft.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(privateDraft)
    expect(await recovered.emailSignature.findUniqueOrThrow({ where: { id: signature.id } })).toEqual(signature)
    expect(await readFile(path.join(restored.restoredDirectory, "data", "files", privateKey))).toEqual(privateBytes)
    expect(await readFile(path.join(restored.restoredDirectory, "demo-access.json"))).toEqual(await readFile(path.join(directory, "demo-access.json")))
  } finally { await recovered.$disconnect() }
  await writeFile(path.join(backup.backupDirectory, "data", "files", fileKey), "Tampered synthetic content")
  const rejected = spawnSync(process.execPath, ["scripts/backup-demo.mjs", "--restore", backup.backupDirectory], { env, encoding: "utf8", timeout: 30_000 })
  expect(rejected.status).not.toBe(0)
  expect(rejected.stderr).toContain("Empreinte de sauvegarde invalide")
  expect(await database.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } })).toEqual(before)
}, 90_000)
