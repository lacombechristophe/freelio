import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({ updateCustomerSite: vi.fn(), updateEquipment: vi.fn(), setCustomerSiteActive: vi.fn(), setEquipmentActive: vi.fn(),
  createCustomerSite: vi.fn(), createEquipment: vi.fn(), createServiceTicket: vi.fn(), createFieldIntervention: vi.fn(), createMaintenanceContract: vi.fn(), renewMaintenanceContract: vi.fn(), transferCustomerSite: vi.fn(), createMaintenanceRenewalProposal: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/actions/asset-management", () => commands)
vi.mock("@/actions/operations", () => commands)
vi.mock("@/actions/site-transfers", () => commands)
vi.mock("@/actions/contrats", () => commands)
import { AuthorizationError } from "@/lib/auth-wrapper"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { z } from "zod"
import * as actions from "@/actions/asset-commands"

describe("asset form replies at the Server Action boundary", () => {
  beforeEach(() => vi.resetAllMocks())
  const cases = [
    [actions.saveSite, commands.updateCustomerSite], [actions.saveEquipment, commands.updateEquipment],
    [actions.changeSiteActivity, commands.setCustomerSiteActive], [actions.changeEquipmentActivity, commands.setEquipmentActive],
    [actions.addCustomerSite, commands.createCustomerSite], [actions.addEquipment, commands.createEquipment],
    [actions.addServiceTicket, commands.createServiceTicket], [actions.addFieldIntervention, commands.createFieldIntervention],
    [actions.addMaintenanceContract, commands.createMaintenanceContract],
    [actions.moveSiteAgency, commands.transferCustomerSite],
  ] as const
  it.each(cases)("returns an expected refusal as serializable data for %s", async (action, command) => {
    command.mockRejectedValueOnce(new AssetLifecycleError("La référence n’est plus disponible."))
    const reply = await action("fictional input")
    expect(JSON.parse(JSON.stringify(reply))).toEqual({ success: false, error: "La référence n’est plus disponible." })
    expect(command).toHaveBeenCalledOnce()
  })
  it("retains the successful domain result", async () => {
    commands.updateCustomerSite.mockResolvedValueOnce({ success: true })
    expect(await actions.saveSite({})).toEqual({ success: true })
  })
  it("passes the displayed renewal revision and returns its expected refusal", async () => {
    commands.renewMaintenanceContract.mockRejectedValueOnce(new AssetLifecycleError("Le contrat a changé."))
    expect(await actions.renewAssetMaintenance("fictional contract", "a".repeat(64))).toEqual({ success: false, error: "Le contrat a changé." })
    expect(commands.renewMaintenanceContract).toHaveBeenCalledWith("fictional contract", "a".repeat(64))
  })
  it("passes the displayed proposal revision and preserves its expected refusal", async () => {
    commands.createMaintenanceRenewalProposal.mockRejectedValueOnce(new AssetLifecycleError("Le contrat a changé pendant la préparation de la proposition."))
    expect(await actions.createAssetMaintenanceProposal("fictional contract", "b".repeat(64))).toEqual({ success: false, error: "Le contrat a changé pendant la préparation de la proposition." })
    expect(commands.createMaintenanceRenewalProposal).toHaveBeenCalledWith("fictional contract", "b".repeat(64))
  })
  it("forwards the proposal explicitly selected for replacement", async () => {
    commands.createMaintenanceRenewalProposal.mockResolvedValueOnce({ id: "fictional successor", status: "DRAFT" })
    expect(await actions.createAssetMaintenanceProposal("fictional contract", "b".repeat(64), "fictional previous proposal")).toEqual({ id: "fictional successor", status: "DRAFT" })
    expect(commands.createMaintenanceRenewalProposal).toHaveBeenCalledWith("fictional contract", "b".repeat(64), "fictional previous proposal")
  })
  it.each([new AuthorizationError("Accès refusé"), new Error(DEMO_READ_ONLY_MESSAGE)])("returns a known access refusal", async error => {
    commands.updateCustomerSite.mockRejectedValueOnce(error)
    expect(await actions.saveSite({})).toEqual({ success: false, error: error.message })
  })
  it("does not expose validation details or the submitted value", async () => {
    const parsed = z.object({ label: z.string() }).safeParse({ label: 42 })
    if (parsed.success) throw new Error("Invalid fixture")
    commands.updateCustomerSite.mockRejectedValueOnce(parsed.error)
    expect(await actions.saveSite({})).toEqual({ success: false, error: "Les valeurs saisies sont invalides. Vérifiez les champs." })
  })
  it("does not treat a missing workspace as a successful save", async () => {
    commands.updateCustomerSite.mockResolvedValueOnce(null)
    expect(await actions.saveSite({})).toMatchObject({ success: false, error: expect.stringContaining("saisie est conservée") })
  })
  it("leaves an unexpected technical exception to the production error boundary", async () => {
    const error = new Error("Fictional private database diagnostic")
    commands.updateCustomerSite.mockRejectedValueOnce(error)
    await expect(actions.saveSite({})).rejects.toBe(error)
  })
})
