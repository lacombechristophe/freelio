import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const commands = vi.hoisted(() => ({ createContractFromQuote: vi.fn(), convertQuoteToCustomerOrder: vi.fn(), updateWarehouse: vi.fn(), setWarehouseActive: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/actions/devis", () => commands)
vi.mock("@/actions/operations", () => commands)
vi.mock("@/actions/warehouses", () => commands)

import { AuthorizationError } from "@/lib/auth-wrapper"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { QuoteConversionError } from "@/lib/quotes/conversion-error"
import { WarehouseLifecycleError } from "@/lib/operations/warehouses"
import { prepareQuoteContract, prepareQuoteOrder } from "@/actions/quote-commands"
import { changeWarehouseActivity, saveWarehouse } from "@/actions/warehouse-commands"

describe("production replies for quote conversions and warehouse changes", () => {
  beforeEach(() => vi.resetAllMocks())
  const cases = [
    ["contract", () => prepareQuoteContract("fictional quote", "a".repeat(64)), commands.createContractFromQuote, new QuoteConversionError("Le devis a changé.")],
    ["order", () => prepareQuoteOrder({ quoteId: "fictional quote" }), commands.convertQuoteToCustomerOrder, new QuoteConversionError("Le devis a changé.")],
    ["warehouse", () => saveWarehouse({ warehouseId: "fictional warehouse" }), commands.updateWarehouse, new WarehouseLifecycleError("Ce dépôt a changé.")],
    ["warehouse activity", () => changeWarehouseActivity({ warehouseId: "fictional warehouse", active: false }), commands.setWarehouseActive, new WarehouseLifecycleError("Ce dépôt contient du stock.")],
  ] as const

  it.each(cases)("returns a serializable expected refusal for %s", async (_name, invoke, command, error) => {
    command.mockRejectedValueOnce(error)
    expect(JSON.parse(JSON.stringify(await invoke()))).toEqual({ error: error.message })
    expect(command).toHaveBeenCalledOnce()
  })

  it("retains the displayed contract revision and successful document", async () => {
    commands.createContractFromQuote.mockResolvedValueOnce({ id: "fictional contract", number: "CONT-1" })
    expect(await prepareQuoteContract("fictional quote", "a".repeat(64))).toEqual({ id: "fictional contract", number: "CONT-1" })
    expect(commands.createContractFromQuote).toHaveBeenCalledWith("fictional quote", "a".repeat(64))
  })

  it("forwards the complete captured warehouse revision", async () => {
    const input = { warehouseId: "fictional warehouse", expectedUpdatedAt: "2030-01-02T00:00:00.000Z", name: "Fictional depot", code: "DEPOT", address: null }
    commands.updateWarehouse.mockResolvedValueOnce({ success: true })
    expect(await saveWarehouse(input)).toEqual({ success: true })
    expect(commands.updateWarehouse).toHaveBeenCalledWith(input)
  })

  const boundaries = [[prepareQuoteOrder, commands.convertQuoteToCustomerOrder], [saveWarehouse, commands.updateWarehouse]] as const
  it.each(boundaries)("does not expose a technical error even if its name mimics a domain error", async (invoke, command) => {
    const error = new Error("Fictional private database diagnostic")
    error.name = "QuoteConversionError"
    command.mockRejectedValueOnce(error)
    await expect(invoke({})).rejects.toBe(error)
  })

  it.each(boundaries)("does not serialize invalid input or validation internals", async (invoke, command) => {
    const parsed = z.object({ id: z.string() }).safeParse({ id: 42 })
    if (parsed.success) throw new Error("Invalid fixture")
    command.mockRejectedValueOnce(parsed.error)
    expect(await invoke({})).toEqual({ error: "Les valeurs saisies sont invalides. Vérifiez les champs." })
  })

  it.each(boundaries)("keeps authorization and demo refusals readable", async (invoke, command) => {
    for (const error of [new AuthorizationError("Accès refusé"), new Error(DEMO_READ_ONLY_MESSAGE)]) {
      command.mockRejectedValueOnce(error)
      expect(await invoke({})).toEqual({ error: error.message })
    }
  })

  it.each(boundaries)("does not claim success when the workspace disappeared", async (invoke, command) => {
    command.mockResolvedValueOnce(null)
    expect(await invoke({})).toEqual({ error: expect.stringContaining("saisie est conservée") })
  })
})
