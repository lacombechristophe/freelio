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
  const headerValue = config.authScheme ? `${config.authScheme} ${apiKey}` : apiKey
  const response = await fetch(target, {
    method: "GET",
    headers: { Accept: "application/json", [config.authHeader || "Authorization"]: headerValue },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`API Extrabat inaccessible (${response.status}). Vérifiez la documentation et les droits de la clé.`)
  }
  return { reachable: true, status: response.status, contentType: response.headers.get("content-type") }
}
