"use server"

import { ZodError } from "zod"
import { AuthorizationError } from "@/lib/auth-wrapper"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import * as management from "@/actions/asset-management"
import * as operations from "@/actions/operations"
import { transferCustomerSite } from "@/actions/site-transfers"

// The existing commands own authorization and their transaction. This boundary
// returns expected failures as data so production Server Actions can display them.
async function reply<T>(command: () => Promise<T>) {
  try {
    const result = await command()
    return result ?? { success: false as const, error: "Votre session ou votre espace n’est plus disponible. Rechargez la page ; votre saisie est conservée." }
  } catch (error) {
    if (error instanceof AssetLifecycleError || error instanceof AuthorizationError) return { success: false as const, error: error.message }
    if (error instanceof ZodError) return { success: false as const, error: "Les valeurs saisies sont invalides. Vérifiez les champs." }
    if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { success: false as const, error: DEMO_READ_ONLY_MESSAGE }
    throw error
  }
}

export async function saveSite(input: unknown) { return reply(() => management.updateCustomerSite(input)) }
export async function saveEquipment(input: unknown) { return reply(() => management.updateEquipment(input)) }
export async function changeSiteActivity(input: unknown) { return reply(() => management.setCustomerSiteActive(input)) }
export async function changeEquipmentActivity(input: unknown) { return reply(() => management.setEquipmentActive(input)) }
export async function moveSiteAgency(input: unknown) { return reply(() => transferCustomerSite(input)) }
export async function addCustomerSite(input: unknown) { return reply(() => operations.createCustomerSite(input)) }
export async function addEquipment(input: unknown) { return reply(() => operations.createEquipment(input)) }
export async function addServiceTicket(input: unknown) { return reply(() => operations.createServiceTicket(input)) }
export async function addFieldIntervention(input: unknown) { return reply(() => operations.createFieldIntervention(input)) }
export async function addMaintenanceContract(input: unknown) { return reply(() => operations.createMaintenanceContract(input)) }
export async function renewAssetMaintenance(contractId: string, expectedRevision: string) { return reply(() => operations.renewMaintenanceContract(contractId, expectedRevision)) }
