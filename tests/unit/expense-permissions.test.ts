import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ role: "OWNER" }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "synthetic-user" }, companyId: "synthetic-company" })) }))
vi.mock("@/lib/prisma", () => ({ default: {
  membership: { findUnique: vi.fn(async () => ({ id: "synthetic-member", role: state.role, status: "ACTIVE", agencyMemberships: [] })) },
  expense: { findMany: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
} }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/local-files", () => ({ removeLocalFile: vi.fn() }))

import prisma from "@/lib/prisma"
import { createExpense, deleteExpense, getExpenses, markExpenseJustified, updateExpense } from "@/actions/depenses"

beforeEach(() => { vi.clearAllMocks(); state.role = "OWNER" })

it("denies expense reads to a technician before reading financial data", async () => {
  state.role = "TECHNICIAN"
  await expect(getExpenses()).rejects.toThrow("droits nécessaires")
  expect(prisma.expense.findMany).not.toHaveBeenCalled()
})

it("allows a viewer to read the current company's expenses", async () => {
  state.role = "VIEWER"
  await expect(getExpenses()).resolves.toEqual([])
  expect(prisma.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "synthetic-company" } }))
})

it.each([
  ["create", () => createExpense({})],
  ["edit", () => updateExpense("synthetic-expense", {})],
  ["delete", () => deleteExpense("synthetic-expense")],
  ["justify", () => markExpenseJustified("synthetic-expense")],
] as const)("denies a viewer permission to %s an expense before touching the database", async (_name, action) => {
  state.role = "VIEWER"
  await expect(action()).rejects.toThrow("droits nécessaires")
  for (const method of [prisma.expense.create, prisma.expense.update, prisma.expense.delete, prisma.expense.findFirst]) expect(method).not.toHaveBeenCalled()
})
