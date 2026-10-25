"use server"

import * as projects from "@/actions/projets"
import { expectedMutation } from "@/lib/mutation-result"

// Browser results preserve public business refusals across production transport.
// Core mutations keep their exception contract for server-side composition.
const messages = new Set([
  "Le chantier a changé. Rechargez la page puis réessayez ; votre saisie est conservée.",
  "Le modèle de chantier a changé. Rechargez la page puis réessayez ; votre saisie est conservée.",
  "Projet introuvable", "Modèle de chantier introuvable", "Modèle de chantier introuvable ou inactif",
  "Client introuvable", "Agence introuvable ou inactive", "Jalon introuvable", "Responsable introuvable", "Élément de recette introuvable",
  "Les références de ce chantier nécessitent une vérification.",
  "Les références de ce jalon nécessitent une vérification.",
  "Les étapes de ce modèle de chantier nécessitent une vérification.",
  "Une étape ne peut dépendre que d’une étape précédente", "Cette dépendance créerait une boucle", "Dépendance introuvable dans ce chantier",
  "Le site du chantier appartient à un autre client. Conservez son client actuel.",
  "Ce chantier possède des documents ou opérations liés. Conservez son client actuel.",
  "Ce chantier possède des documents ou opérations liés. Archivez-le plutôt.",
  "La référence d’un fichier du chantier est incohérente. Sa suppression nécessite une vérification.",
])

export async function createProject(...args: Parameters<typeof projects.createProject>) {
  return expectedMutation(() => projects.createProject(...args), messages)
}
export async function updateProject(...args: Parameters<typeof projects.updateProject>) {
  return expectedMutation(() => projects.updateProject(...args), messages)
}
export async function archiveProject(...args: Parameters<typeof projects.archiveProject>) {
  return expectedMutation(() => projects.archiveProject(...args), messages)
}
export async function deleteProject(...args: Parameters<typeof projects.deleteProject>) {
  return expectedMutation(() => projects.deleteProject(...args), messages)
}
export async function createProjectTemplate(...args: Parameters<typeof projects.createProjectTemplate>) {
  return expectedMutation(() => projects.createProjectTemplate(...args), messages)
}
export async function setProjectTemplateActive(...args: Parameters<typeof projects.setProjectTemplateActive>) {
  return expectedMutation(() => projects.setProjectTemplateActive(...args), messages)
}
export async function createProjectMilestone(...args: Parameters<typeof projects.createProjectMilestone>) {
  return expectedMutation(() => projects.createProjectMilestone(...args), messages)
}
export async function updateProjectMilestoneStatus(...args: Parameters<typeof projects.updateProjectMilestoneStatus>) {
  return expectedMutation(() => projects.updateProjectMilestoneStatus(...args), messages)
}
export async function updateProjectMilestonePlanning(...args: Parameters<typeof projects.updateProjectMilestonePlanning>) {
  return expectedMutation(() => projects.updateProjectMilestonePlanning(...args), messages)
}
export async function deleteProjectMilestone(...args: Parameters<typeof projects.deleteProjectMilestone>) {
  return expectedMutation(() => projects.deleteProjectMilestone(...args), messages)
}
export async function createProjectAcceptanceItem(...args: Parameters<typeof projects.createProjectAcceptanceItem>) {
  return expectedMutation(() => projects.createProjectAcceptanceItem(...args), messages)
}
export async function updateProjectAcceptanceStatus(...args: Parameters<typeof projects.updateProjectAcceptanceStatus>) {
  return expectedMutation(() => projects.updateProjectAcceptanceStatus(...args), messages)
}
export async function deleteProjectAcceptanceItem(...args: Parameters<typeof projects.deleteProjectAcceptanceItem>) {
  return expectedMutation(() => projects.deleteProjectAcceptanceItem(...args), messages)
}
export async function upsertProjectTechnicalProfile(...args: Parameters<typeof projects.upsertProjectTechnicalProfile>) {
  return expectedMutation(() => projects.upsertProjectTechnicalProfile(...args), messages)
}
