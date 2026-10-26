import type { CompanyRole } from "@/lib/permissions"

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  SALES: "Commercial",
  OPERATIONS: "Planification",
  TECHNICIAN: "Technicien",
  SERVICE: "SAV",
  ACCOUNTING: "Comptabilité",
  VIEWER: "Lecture seule",
}
