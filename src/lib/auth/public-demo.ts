import prisma from "@/lib/prisma"
import { DEMO_ACCOUNT_EMAIL } from "@/lib/demo-mode"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"

export function publicDemoAccessEnabled(environment: Record<string, string | undefined> = process.env) {
  return isPublicReadOnlyDemo(environment)
    && environment.NEXT_PUBLIC_DEMO_MODE === "true"
    && environment.NEXT_PUBLIC_DEMO_READ_ONLY === "true"
}

/** This identity is fixed on the server; a visitor never selects an account. */
export async function readPublicDemoUser() {
  if (!publicDemoAccessEnabled()) return null
  const user = await prisma.user.findUnique({
    where: { email: DEMO_ACCOUNT_EMAIL },
    select: {
      id: true, email: true, name: true, image: true, companyId: true,
      sessionVersion: true, mfaEnabledAt: true,
      memberships: { where: { status: "ACTIVE" }, select: { companyId: true } },
    },
  })
  if (!user?.companyId || user.mfaEnabledAt || !user.memberships.some(membership => membership.companyId === user.companyId)) return null
  return user
}
