import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { gzipSync, gunzipSync } from "node:zlib"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { buildBackupPayload } from "@/lib/backup"
import { verifyReversibilityExport } from "@/lib/backup-integrity"
import { encryptBytes, decryptBytes } from "@/lib/crypto"
let companyId = "", userId = ""
beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: "Synthetic backup roundtrip" } })
  const user = await prisma.user.create({ data: { email: company.id + "@example.test", companyId: company.id } })
  companyId = company.id; userId = user.id
  await prisma.membership.create({ data: { companyId, userId, role: "OWNER" } })
})
afterAll(async () => {
  await prisma.user.update({ where: { id: userId }, data: { companyId: null } })
  await prisma.membership.deleteMany({ where: { companyId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.user.delete({ where: { id: userId } })
})
it("collects the actual schema and verifies the encrypted/compressed archive roundtrip", async () => {
  const payload = await buildBackupPayload(userId, companyId)
  expect(payload.manifest.status).toBe("COMPLETE")
  const encrypted = encryptBytes(gzipSync(JSON.stringify(payload)))
  const recovered = JSON.parse(gunzipSync(decryptBytes(encrypted)).toString())
  expect(verifyReversibilityExport(recovered).ok).toBe(true)
  expect(recovered.tables.find((table: { model: string }) => table.model === "Company").rows[0].id).toBe(companyId)
  recovered.tables.find((table: { model: string }) => table.model === "Company").rows[0].name = "Tampered synthetic name"
  expect(verifyReversibilityExport(recovered).ok).toBe(false)
})
