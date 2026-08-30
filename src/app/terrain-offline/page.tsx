import { TerrainWorkspace } from "@/app/dashboard/terrain/terrain-workspace"
import { AppBrand } from "@/components/shared/app-brand"
import type { FieldSnapshot } from "@/lib/field/offline"

const emptySnapshot: FieldSnapshot = {
  companyId: "offline",
  companyName: "Freelio",
  cachedAt: "1970-01-01T00:00:00.000Z",
  expiresAt: "1970-01-01T00:00:00.000Z",
  assignments: [],
  products: [],
  warehouses: [],
}

export default function TerrainOfflinePage() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto w-full max-w-5xl">
        <AppBrand href="/" />
        <div className="mb-7 mt-8 max-w-3xl">
          <p className="text-xs font-semibold text-primary">Application terrain</p>
          <h1 className="mt-2 text-3xl font-semibold">Terrain hors ligne</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Copie locale temporaire des interventions et file de synchronisation de cet appareil.</p>
        </div>
        <TerrainWorkspace initialSnapshot={emptySnapshot} />
      </div>
    </main>
  )
}
