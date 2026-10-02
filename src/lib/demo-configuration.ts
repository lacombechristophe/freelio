import { isPublicReadOnlyDemo } from "./demo-policy"

export function publicDemoConfigurationIssues(environment: Record<string, string | undefined> = process.env) {
  const readonly = isPublicReadOnlyDemo(environment)
  if (!readonly && environment.NEXT_PUBLIC_DEMO_READ_ONLY !== "true") return []
  const issues: string[] = []
  if (!readonly) issues.push("DEMO_ACCESS_MODE")
  if (environment.NEXT_PUBLIC_DEMO_MODE !== "true") issues.push("NEXT_PUBLIC_DEMO_MODE")
  if (environment.NEXT_PUBLIC_DEMO_READ_ONLY !== "true") issues.push("NEXT_PUBLIC_DEMO_READ_ONLY")
  for (const key of Object.keys(environment)) {
    if (environment[key]?.trim() && /^(RESEND_API_KEY|STRIPE_SECRET_KEY|GOOGLE_CLIENT_SECRET|MICROSOFT_CLIENT_SECRET|EXTRABAT_.*(KEY|SECRET|TOKEN))$/.test(key)) issues.push(key)
  }
  return issues
}
