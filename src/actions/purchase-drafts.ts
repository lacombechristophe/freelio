"use server"

import { createPurchaseOrder } from "@/actions/operations"

export async function createPurchaseDraft(input: unknown) {
  try {
    return await createPurchaseOrder(input)
  } catch (error) {
    // Expected refusals cross the Action boundary as data. Unexpected errors
    // retain Next.js production redaction instead of exposing database details.
    if (error instanceof Error && ["Chantier introuvable", "Un produit fournisseur est introuvable"].includes(error.message)) {
      return { success: false as const, error: error.message }
    }
    throw error
  }
}
