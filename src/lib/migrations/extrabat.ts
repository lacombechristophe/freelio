import "server-only"

export type ExtrabatConnectionConfig = {
  baseUrl: string
  testPath: string
  authHeader: string
  authScheme: string
}

export async function testExtrabatConnection(apiKey: string, config: ExtrabatConnectionConfig) {
  const baseUrl = new URL(config.baseUrl)
  if (baseUrl.protocol !== "https:") throw new Error("L'API Extrabat doit utiliser HTTPS")

  const target = new URL(config.testPath || "/", baseUrl)
  if (target.origin !== baseUrl.origin) throw new Error("Le chemin de test doit rester sur le serveur Extrabat")
  if (target.username || target.password) throw new Error("L’adresse API ne doit pas contenir d’identifiants")
  // Origins are approved by the operator, never by a tenant-supplied setting.
  const allowedOrigins = (process.env.EXTRABAT_API_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)
  if (!allowedOrigins.includes(target.origin)) {
    throw new Error("Cette origine API Extrabat n’est pas autorisée par l’opérateur. Utilisez l’import par fichiers en attendant sa validation.")
  }
  const headerValue = config.authScheme ? `${config.authScheme} ${apiKey}` : apiKey
  const response = await fetch(target, {
    method: "GET",
    headers: { Accept: "application/json", [config.authHeader || "Authorization"]: headerValue },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`API Extrabat inaccessible (${response.status}). Vérifiez la documentation et les droits de la clé.`)
  }
  const contentType = response.headers.get("content-type") ?? ""
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new Error("La route n’a pas retourné de JSON : une page de connexion ne valide pas l’accès API Extrabat.")
  }
  try {
    await response.json()
  } catch {
    throw new Error("La route Extrabat a retourné un JSON invalide.")
  }
  // No documented account-specific response contract is available yet.
  return { reachable: true, authorizationVerified: false, importAvailable: false, status: response.status, contentType }
}
