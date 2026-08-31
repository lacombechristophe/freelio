"use client"

import Link from "next/link"
import { useActionState } from "react"
import { ArrowLeft, Loader2, Mail, ShieldCheck } from "lucide-react"

import { requestPasswordReset, type PasswordResetState } from "@/actions/auth/password-reset"
import { AppBrand } from "@/components/shared/app-brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: PasswordResetState = { success: false }

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState)
  return <main className="marketing-surface min-h-screen bg-freelio-canvas p-6 text-freelio-ink">
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-center">
      <AppBrand href="/" />
      <section className="mt-8 rounded-2xl border border-freelio-line bg-white p-7 shadow-freelio-stage sm:p-9">
        <div className="grid size-11 place-items-center rounded-xl bg-[#eaf2ff] text-freelio-accent"><Mail className="size-5" /></div>
        <h1 className="marketing-display mt-5 text-3xl font-semibold">Réinitialiser le mot de passe</h1>
        <p className="mt-3 text-sm leading-6 text-freelio-muted">Le lien est à usage unique et expire après 30 minutes. La réponse reste volontairement identique pour toutes les adresses.</p>
        {state.success ? <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><ShieldCheck className="mr-2 inline size-4" />{state.message}</div> : <form action={action} className="mt-7 space-y-4">
          <div className="space-y-2"><Label htmlFor="email">Adresse e-mail</Label><Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr" /></div>
          {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          <Button className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Envoyer le lien</Button>
        </form>}
        <Link href="/auth/login" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-freelio-accent hover:underline"><ArrowLeft className="size-4" />Retour à la connexion</Link>
      </section>
    </div>
  </main>
}
