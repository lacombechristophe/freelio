import { WifiOff } from "lucide-react"

import { AppBrand } from "@/components/shared/app-brand"

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground">
      <div className="w-full max-w-lg">
        <AppBrand href="/" />
        <section className="mt-10 rounded-xl border bg-card p-6">
          <span className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground"><WifiOff className="size-5" /></span>
          <h1 className="mt-5 text-xl font-semibold">Connexion indisponible</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">L’écran terrain n’a pas encore été rendu disponible sur cet appareil. Reconnectez-vous, ouvrez « Terrain hors ligne », puis activez la copie locale.</p>
        </section>
      </div>
    </main>
  )
}
