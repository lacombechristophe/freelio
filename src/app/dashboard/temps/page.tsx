import { getTimeDirectory } from "@/actions/temps/directory"
import { TempsView } from "./temps-view"

export default async function TempsPage() {
  const initial = await getTimeDirectory()
  if (!initial) return null
  return <TempsView initial={initial} />
}
