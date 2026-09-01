import { jwtVerify, SignJWT } from "jose"

const ISSUER = "crm-erp"
const AUDIENCE = "marketing-consent-withdrawal"
const DEVELOPMENT_SECRET = "crm-development-consent-secret-change-me"

export type ConsentWithdrawalToken = {
  purpose: "MARKETING_WITHDRAWAL"
  companyId: string
  leadId: string
}

function consentSecret(secretOverride?: string) {
  const configured = [
    secretOverride,
    process.env.CONSENT_TOKEN_SECRET,
    process.env.JWT_SECRET,
    process.env.AUTH_SECRET,
  ].map((value) => value?.trim()).find(Boolean)

  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("CONSENT_TOKEN_SECRET, JWT_SECRET or AUTH_SECRET is required in production")
  }

  return new TextEncoder().encode(configured || DEVELOPMENT_SECRET)
}

export async function createConsentWithdrawalToken(
  payload: Omit<ConsentWithdrawalToken, "purpose">,
  secretOverride?: string,
) {
  return new SignJWT({ ...payload, purpose: "MARKETING_WITHDRAWAL" satisfies ConsentWithdrawalToken["purpose"] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .sign(consentSecret(secretOverride))
}

export async function verifyConsentWithdrawalToken(token: string, secretOverride?: string) {
  try {
    const { payload } = await jwtVerify(token, consentSecret(secretOverride), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    })

    if (
      payload.purpose !== "MARKETING_WITHDRAWAL"
      || typeof payload.companyId !== "string"
      || typeof payload.leadId !== "string"
      || !payload.companyId
      || !payload.leadId
    ) {
      return null
    }

    return {
      purpose: payload.purpose,
      companyId: payload.companyId,
      leadId: payload.leadId,
    } satisfies ConsentWithdrawalToken
  } catch {
    return null
  }
}
