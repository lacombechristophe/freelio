"use server"

import { ZodError } from "zod"
import { AuthorizationError } from "@/lib/auth-wrapper"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { deleteContract, updateContractStatus } from "@/actions/contrats"

async function reply<T>(command: () => Promise<T>) {
  try { return await command() ?? { error: "Votre session ou votre espace n’est plus disponible. Rechargez la page." } }
  catch (error) {
    if (error instanceof AssetLifecycleError || error instanceof AuthorizationError) return { error: error.message }
    if (error instanceof ZodError) return { error: "Les valeurs saisies sont invalides." }
    if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { error: error.message }
    throw error
  }
}

export async function changeContractStatus(id: string, status: "SENT" | "EXPIRED") { return reply(() => updateContractStatus(id, status)) }
export async function removeContract(id: string) { return reply(() => deleteContract(id)) }
