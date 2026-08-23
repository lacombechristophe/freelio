"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" />
      <div className="space-y-1">
        <p className="font-bold">Erreur de chargement</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
      <Button size="sm" onClick={reset}>Réessayer</Button>
    </div>
  )
}
