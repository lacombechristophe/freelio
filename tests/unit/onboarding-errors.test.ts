import { describe, expect, it } from "vitest"

import { DUPLICATE_SIRET_MESSAGE, onboardingErrorCode, onboardingErrorMessage } from "@/lib/onboarding-errors"

describe("onboarding error messages", () => {
  it("explains how to recover from a duplicated SIRET", () => {
    expect(onboardingErrorMessage({ code: "P2002", meta: { target: ["siret"] } })).toBe(DUPLICATE_SIRET_MESSAGE)
  })

  it("does not expose another unique database field", () => {
    expect(onboardingErrorMessage({ code: "P2002", meta: { target: "Company_name_key" } })).toBe(
      "Un espace utilise déjà ces informations. Vérifiez vos saisies ou contactez le support.",
    )
  })

  it("does not expose an unexpected internal error", () => {
    expect(onboardingErrorMessage(new Error("Invalid `prisma.company.create()` invocation"))).toBe(
      "Impossible de créer votre espace pour le moment. Réessayez ; si le problème persiste, contactez le support.",
    )
    expect(onboardingErrorCode(new Error("database unavailable"))).toBe("UNKNOWN")
  })

  it("reads Prisma error codes without relying on instanceof", () => {
    expect(onboardingErrorCode({ code: "P2002" })).toBe("P2002")
  })
})
