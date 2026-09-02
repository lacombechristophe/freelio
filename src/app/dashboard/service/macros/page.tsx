import { getServiceMacros } from "@/actions/service-macros"
import { PageHeader } from "@/components/shared/page-header"

import { ServiceMacrosManager } from "./service-macros-manager"

export default async function ServiceMacrosPage() {
  const macros = await getServiceMacros()
  return <div className="workspace-page"><PageHeader eyebrow="Service" title="Macros de réponse" description="Standardisez les réponses fréquentes sans perdre le contexte du ticket ni la relecture humaine." /><ServiceMacrosManager macros={macros} /></div>
}
