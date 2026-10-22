import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const commands = vi.hoisted(() => ({ updateContractStatus: vi.fn(), deleteContract: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/actions/contrats", () => commands)
import { changeContractStatus, removeContract } from "@/actions/contract-commands"
import { AuthorizationError } from "@/lib/auth-wrapper"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"

describe("Contract command responses at the production boundary", () => {
  beforeEach(() => vi.resetAllMocks())
  it("preserves the result and signing path from an authorized status change", async () => {
    commands.updateContractStatus.mockResolvedValueOnce({ status: "SENT", signingPath: "/sign/contracts/fictional-token" })
    expect(await changeContractStatus("fictional contract", "SENT")).toEqual({ status: "SENT", signingPath: "/sign/contracts/fictional-token" })
    expect(commands.updateContractStatus).toHaveBeenCalledWith("fictional contract", "SENT")
  })
  it.each([new AssetLifecycleError("Les conditions du renouvellement ont changé."), new AuthorizationError("Accès refusé"), new Error(DEMO_READ_ONLY_MESSAGE)])("serializes an expected refusal without treating it as success", async error => {
    commands.updateContractStatus.mockRejectedValueOnce(error)
    expect(JSON.parse(JSON.stringify(await changeContractStatus("fictional contract", "SENT")))).toEqual({ error: error.message })
  })
  it("forwards a successful deletion and retains an immutable-document refusal", async () => {
    commands.deleteContract.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new AssetLifecycleError("Un contrat signé doit être conservé."))
    expect(await removeContract("fictional contract")).toEqual({ ok: true })
    expect(await removeContract("fictional contract")).toEqual({ error: "Un contrat signé doit être conservé." })
  })
  it("does not report success for a missing workspace", async () => {
    commands.updateContractStatus.mockResolvedValueOnce(null)
    expect(await changeContractStatus("fictional contract", "SENT")).toMatchObject({ error: expect.stringContaining("session") })
  })
  it("does not expose validation input or an unexpected technical diagnostic", async () => {
    const invalid = z.string().safeParse(42)
    if (invalid.success) throw new Error("Invalid fixture")
    commands.updateContractStatus.mockRejectedValueOnce(invalid.error)
    expect(await changeContractStatus("fictional contract", "SENT")).toEqual({ error: "Les valeurs saisies sont invalides." })
    const technical = new Error("Fictional private diagnostic")
    commands.updateContractStatus.mockRejectedValueOnce(technical)
    await expect(changeContractStatus("fictional contract", "SENT")).rejects.toBe(technical)
  })
})
