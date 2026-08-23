import "server-only"

import { AuthorizationError, resolveAuthContext, type AuthContext } from "@/lib/auth-wrapper"
import { hasPermission, type Permission } from "@/lib/permissions"

type RouteAuthResult =
  | { ok: true; context: AuthContext }
  | { ok: false; response: Response }

export async function getRouteAuth(permission?: Permission): Promise<RouteAuthResult> {
  try {
    const context = await resolveAuthContext()
    if (!context) {
      return { ok: false, response: Response.json({ error: "Entreprise non configurée" }, { status: 409 }) }
    }
    if (permission && !hasPermission(context.role, permission)) {
      return { ok: false, response: Response.json({ error: "Accès refusé" }, { status: 403 }) }
    }
    return { ok: true, context }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, response: Response.json({ error: error.message }, { status: 401 }) }
    }
    throw error
  }
}
