import { redirect } from "next/navigation"
import { publicDemoAccessEnabled } from "@/lib/auth/public-demo"
import { DemoEntry } from "@/components/shared/demo-entry"

export const dynamic = "force-dynamic"

export default function DemoPage() {
  if (!publicDemoAccessEnabled()) redirect("/auth/login")
  return <DemoEntry autoStart />
}
