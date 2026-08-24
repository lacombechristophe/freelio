"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, MailX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function WithdrawalCard({ token, companyName }: { token: string; companyName: string }) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  async function withdraw() {
    setState("submitting")
    setMessage("")
    try {
      const response = await fetch("/api/public/consent/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const result = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !result.success) throw new Error(result.error || "Retrait impossible.")
      setState("success")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Retrait impossible.")
      setState("error")
    }
  }

  if (state === "success") {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-success/10 text-success"><CheckCircle2 className="size-5" /></div>
          <CardTitle>Préférence enregistrée</CardTitle>
          <CardDescription>Vous ne recevrez plus de communications commerciales de {companyName}.</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm leading-6 text-muted-foreground">Les messages nécessaires au suivi d'une demande, d'une commande ou d'un contrat restent inchangés.</p></CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><MailX className="size-5" /></div>
        <CardTitle>Se désinscrire des communications</CardTitle>
        <CardDescription>Confirmez le retrait de votre consentement marketing pour {companyName}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">Cette action concerne uniquement les offres, nouveautés et conseils commerciaux.</p>
        {state === "error" ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
      </CardContent>
      <CardFooter>
        <Button className="w-full" variant="outline" onClick={withdraw} disabled={state === "submitting"}>
          {state === "submitting" ? <><Loader2 className="animate-spin" />Enregistrement…</> : "Confirmer ma désinscription"}
        </Button>
      </CardFooter>
    </Card>
  )
}
