import "server-only"

import { AuthorizationError, resolveAuthContext, type AuthContext } from "@/lib/auth-wrapper"
import { requestContext } from "@/lib/context"
import { hasPermission, type Permission } from "@/lib/permissions"

type RouteAuthResult = { ok: true; context: AuthContext } | { ok: false; response: Response }

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
}

function authError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: PRIVATE_RESPONSE_HEADERS })
}

async function getRouteAuth(permission?: Permission): Promise<RouteAuthResult> {
  try {
    const context = await resolveAuthContext()
    if (!context) {
      return { ok: false, response: authError("Entreprise non configurée", 409) }
    }
    if (permission && !hasPermission(context.role, permission)) {
      return { ok: false, response: authError("Accès refusé", 403) }
    }
    return { ok: true, context }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, response: authError(error.message, 401) }
    }
    throw error
  }
}

/**
 * Authenticates and authorizes a Route Handler, then keeps the tenant and
 * agency boundary active for every Prisma query executed by that handler.
 */
export async function withRouteAuth(permission: Permission | undefined, handler: (context: AuthContext) => Promise<Response>): Promise<Response> {
  const access = await getRouteAuth(permission)
  if (!access.ok) return access.response

  const response = await requestContext.run({ ...access.context, actionPermission: permission }, () => handler(access.context))
  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
    response.headers.set(name, value)
  }
  return response
}
