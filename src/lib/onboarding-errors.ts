export const DUPLICATE_SIRET_MESSAGE =
  "Ce SIRET est déjà rattaché à un autre espace. Pour un compte de démonstration, laissez ce champ vide ; pour rejoindre l’entreprise existante, demandez une invitation."

const DUPLICATE_COMPANY_MESSAGE =
  "Un espace utilise déjà ces informations. Vérifiez vos saisies ou contactez le support."

const GENERIC_ONBOARDING_MESSAGE =
  "Impossible de créer votre espace pour le moment. Réessayez ; si le problème persiste, contactez le support."

function prismaError(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as { code?: unknown; meta?: { target?: unknown } })
    : null
}

export function onboardingErrorMessage(error: unknown) {
  const candidate = prismaError(error)
  if (candidate?.code !== "P2002") return GENERIC_ONBOARDING_MESSAGE

  const target = candidate.meta?.target
  const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : []
  return fields.some((field) => String(field).toLowerCase().includes("siret"))
    ? DUPLICATE_SIRET_MESSAGE
    : DUPLICATE_COMPANY_MESSAGE
}

export function onboardingErrorCode(error: unknown) {
  const code = prismaError(error)?.code
  return typeof code === "string" ? code : "UNKNOWN"
}
