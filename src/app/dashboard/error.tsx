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
      <div className="h-16 w-16 rounded-2xl bg-danger/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Une erreur est survenue</h2>
        <p className="text-muted-foreground max-w-sm">
          {error.message || "Quelque chose s'est mal passé. Réessayez ou contactez le support."}
        </p>
      </div>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  )
}
