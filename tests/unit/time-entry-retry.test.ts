import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ failures: [] as unknown[], transactions: 0, authorizations: 0 }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ default: { $transaction: async (action: (tx: object) => unknown) => {
  state.transactions++
  if (state.failures.length) throw state.failures.shift()
  return action({})
} } }))
vi.mock("@/lib/auth-wrapper", () => ({
  AuthorizationError: class extends Error {},
  withAuth: async (action: (context: object) => unknown) => { state.authorizations++; return action({}) },
}))
import { mutateTime } from "@/lib/time-entry-mutations"
import { revalidatePath } from "next/cache"

beforeEach(() => { state.failures = []; state.transactions = 0; state.authorizations = 0; vi.clearAllMocks() })
const action = vi.fn(async () => ({ value: "saved", projectId: "fictional-project" }))

it.each([{ code: "P2034" }, { code: "P2010", meta: { code: "40001" } }, { code: "P2010", meta: { code: "40P01" } }])("retries an aborted transaction without relying on its Error prototype: %j", async conflict => {
  state.failures = [conflict]
  expect(await mutateTime(action)).toEqual({ ok: true, value: "saved" })
  expect(state.transactions).toBe(2)
  expect(state.authorizations).toBe(2)
  expect(action).toHaveBeenCalledOnce()
  expect(revalidatePath).toHaveBeenCalledTimes(3)
})

it.each([{ code: "P2028" }, { code: "P1001" }, { code: "P2010", meta: { code: "08006" } }, new Error("P2034")])("does not replay an unconfirmed transaction result: %j", async failure => {
  state.failures = [failure]
  await expect(mutateTime(action)).rejects.toBe(failure)
  expect(state.transactions).toBe(1)
  expect(state.authorizations).toBe(1)
  expect(action).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})

it("keeps the three-attempt limit and never reports an exhausted conflict as success", async () => {
  const conflict = { code: "P2034" }
  state.failures = [conflict, conflict, conflict]
  await expect(mutateTime(action)).rejects.toBe(conflict)
  expect(state.transactions).toBe(3)
  expect(state.authorizations).toBe(3)
  expect(action).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})
