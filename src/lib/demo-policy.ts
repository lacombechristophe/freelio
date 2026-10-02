type Environment = Record<string, string | undefined>

export const DEMO_READ_ONLY_MESSAGE = "Cette démonstration est en lecture seule. Les modifications et les envois sont désactivés."

export function isPublicReadOnlyDemo(environment: Environment = process.env) {
  return environment.DEMO_ACCESS_MODE === "readonly"
}

export function assertDemoMutationAllowed(environment: Environment = process.env) {
  if (isPublicReadOnlyDemo(environment)) throw new Error(DEMO_READ_ONLY_MESSAGE)
}

/** An allowlist avoids accidentally exposing a new processor/OAuth/webhook route. */
export function publicDemoRequestAllowed(pathname: string, method: string) {
  if (pathname === "/auth/login") return method === "GET" || method === "POST"
  if (pathname.startsWith("/auth/")) return false
  if (pathname.startsWith("/api/auth/")) {
    return ["/api/auth/csrf", "/api/auth/session", "/api/auth/providers", "/api/auth/callback/credentials", "/api/auth/signout", "/api/auth/error"].includes(pathname)
      && ["GET", "POST"].includes(method)
  }
  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD"].includes(method)) return false
    return /^\/api\/(health\/(live|ready)|pdf\/(devis|facture|contrat|achat|livraison|intervention)\/[^/]+|files\/[^/]+\/[^/]+|reports\/export|accounting\/export|organisation\/calendar\.ics)$/.test(pathname)
  }
  if (/^\/(portal|sign|join|feedback|consent|onboarding|dev)(\/|$)/.test(pathname)) return false
  if (pathname.startsWith("/dashboard")) {
    if (/(^|\/)(new|edit|import)(\/|$)/.test(pathname)) return false
    // Read actions also use POST. Mutation rejection belongs in the DAL.
    return ["GET", "HEAD", "POST"].includes(method)
  }
  return ["GET", "HEAD"].includes(method)
}
