export type PortalAppointment = {
  id: string
  subject: string
  preferredStart: string
  alternativeStart: string | null
  durationMinutes: number
  notes: string | null
  status: string
  response: string | null
  updatedAt: string
  assignedMembershipId: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  confirmedAt: string | null
  member: string | null
}

export const appointmentLabels: Record<string, string> = {
  PENDING: "À traiter", CONFIRMED: "Confirmé", DECLINED: "Refusé", CANCELLED: "Annulé", COMPLETED: "Terminé",
}
