import { afterEach, expect, it, vi } from "vitest"
import prisma from "@/lib/prisma"

afterEach(() => vi.unstubAllEnvs())

it("refuses model and raw writes outside a request context, including transactions, while permitting health reads", async () => {
  vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
  await expect(prisma.company.create({ data: { id: "readonly-must-not-exist", name: "Forbidden mutation" } })).rejects.toThrow("lecture seule")
  await expect(prisma.$transaction(async tx => tx.company.create({ data: { id: "readonly-transaction-must-not-exist", name: "Forbidden transaction" } }))).rejects.toThrow("lecture seule")
  await expect(prisma.$transaction(async tx => tx.$executeRawUnsafe("DELETE FROM Company"))).rejects.toThrow("lecture seule")
  expect(() => prisma.$executeRawUnsafe("DELETE FROM Company")).toThrow("lecture seule")
  expect(() => prisma.$queryRawUnsafe("SELECT 1")).toThrow("lecture seule")
  expect(() => prisma.$queryRaw`DELETE FROM Company`).toThrow("lecture seule")
  await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeTruthy()
  expect(await prisma.company.count({ where: { id: { in: ["readonly-must-not-exist", "readonly-transaction-must-not-exist"] } } })).toBe(0)
})
