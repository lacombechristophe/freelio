"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AppBrand } from "@/components/shared/app-brand"

export function DemoEntry({ autoStart = false }: { autoStart?: boolean }) {
  const router = useRouter()
  const started = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const enter = useCallback(async () => {
    setPending(true)
    setError("")
    try {
      const result = await signIn("demo", { redirect: false, redirectTo: "/dashboard" })
      if (!result || result.error || !result.ok) throw new Error("Demo unavailable")
      router.replace("/dashboard")
      router.refresh()
    } catch {
      setError("La démonstration n’est pas disponible pour le moment. Réessayez dans quelques instants.")
      setPending(false)
    }
  }, [router])

  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true
    void enter()
  }, [autoStart, enter])

  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
    <AppBrand href="/" />
    <div className="space-y-5 rounded-xl border bg-card p-6 text-card-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Découvrez Freelio</h1>
      <p className="text-sm leading-6 text-muted-foreground">Explorez les dossiers et documents fictifs. La démonstration est en lecture seule ; aucune donnée réelle ne doit être importée.</p>
      <Button demoMutation={false} disabled={pending} onClick={() => void enter()} className="w-full">
        {pending ? <><Loader2 className="animate-spin" />Ouverture en cours…</> : <>Ouvrir la démonstration<ArrowRight /></>}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p aria-live="polite" className="sr-only">{pending ? "Ouverture de la démonstration en cours" : ""}</p>
      <Link href="/" className="inline-flex min-h-10 items-center text-sm underline underline-offset-4">Retour au site</Link>
    </div>
  </main>
}
