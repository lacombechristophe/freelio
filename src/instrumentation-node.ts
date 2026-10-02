import { publicDemoConfigurationIssues } from "./lib/demo-configuration"
import { isReadOnlyDemo } from "./lib/demo-mode"

export async function initializeNodeRuntime() {
  const issues = publicDemoConfigurationIssues()
  if (issues.length) throw new Error(`Configuration de démonstration invalide : ${issues.join(", ")}`)
  if (isReadOnlyDemo !== (process.env.DEMO_ACCESS_MODE === "readonly")) throw new Error("Le build et le mode serveur de démonstration sont incohérents")
  if (process.env.DEMO_ACCESS_MODE === "readonly") {
    await import("../scripts/public-demo-network.cjs")
  }
}
