"use server"

import * as operations from "@/actions/operations"
import { expectedMutation } from "@/lib/mutation-result"

const messages = new Set([
  "Intervention introuvable", "Contrat d’entretien introuvable", "Ce terme a déjà été renouvelé",
  "Ce contrat a changé. Vérifiez la version actuelle avant de réessayer.",
])

export async function updateInterventionStatus(...args: Parameters<typeof operations.updateInterventionStatus>) {
  return expectedMutation(() => operations.updateInterventionStatus(...args), messages)
}

export async function updateMaintenanceRenewalSettings(...args: Parameters<typeof operations.updateMaintenanceRenewalSettings>) {
  return expectedMutation(() => operations.updateMaintenanceRenewalSettings(...args), messages)
}
