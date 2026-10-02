"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="h-12 w-12 rounded-lg bg-danger/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Impossible de charger cette page</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Réessayez dans un instant. Si le problème persiste, contactez le support.
        </p>
        {error.digest && <p className="text-xs text-muted-foreground">Référence : {error.digest}</p>}
      </div>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  )
}
