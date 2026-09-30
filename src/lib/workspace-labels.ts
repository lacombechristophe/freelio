// Display labels only: persisted status codes and custom labels remain unchanged.
const WORKSPACE_STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau", CONTACTED: "Contacté", QUALIFIED: "Qualifié", SPAM: "Indésirable",
  TODO: "À faire", IN_PROGRESS: "En cours", DONE: "Terminé", BLOCKED: "Bloqué",
  DRAFT: "Brouillon", PLANNED: "Planifié", ACTIVE: "En cours", PAUSED: "En pause",
  COMPLETED: "Terminé", ARCHIVED: "Archivé", CANCELLED: "Annulé", CANCELED: "Annulé",
  SENT: "Envoyé", ACCEPTED: "Accepté", REJECTED: "Refusé", EXPIRED: "Expiré",
  OPEN: "Ouvert", DIAGNOSIS: "Diagnostic", WAITING_PARTS: "En attente de pièces",
  SCHEDULED: "Planifié", RESOLVED: "Résolu", CLOSED: "Clôturé",
  DISCOVERY: "Découverte", PROPOSAL: "Proposition", NEGOTIATION: "Négociation",
  WON: "Gagné", LOST: "Perdu", PROSPECT: "Prospect", WAITING: "En attente", MERGED: "Fusionné",
}

export function workspaceStatusLabel(status: string): string {
  return WORKSPACE_STATUS_LABELS[status] ?? status
}
