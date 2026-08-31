"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck, UserRound } from "lucide-react"
import { toast } from "sonner"

import { registerWithPassword, type RegisterState } from "@/actions/auth/register"
import { AppBrand } from "@/components/shared/app-brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: RegisterState = { success: false }

const benefits = [
  "Créez le profil et l’identité de votre entreprise ensuite",
  "Invitez votre équipe avec des rôles et droits distincts",
  "Importez vos données seulement quand l’espace est prêt",
]

export default function RegisterPage() {
  const [state, formAction, isPending] = React.useActionState(registerWithPassword, initialState)

  React.useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  return (
    <main className="marketing-surface grid min-h-screen bg-white text-freelio-ink lg:grid-cols-[minmax(520px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="flex min-h-screen flex-col px-6 py-5 sm:px-10 sm:py-7 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between"><AppBrand href="/" /><Link href="/auth/login" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-freelio-muted hover:text-freelio-ink"><ArrowLeft className="size-4" />Connexion</Link></div>
        <div className="my-auto w-full max-w-[470px] py-12 lg:self-center">
          <p className="text-xs font-semibold uppercase text-freelio-accent">Créer votre espace</p>
          <h1 className="marketing-display mt-4 text-[38px] font-semibold leading-[1.03] sm:text-[46px]">Votre entreprise commence par un compte propriétaire.</h1>
          <p className="mt-5 text-base leading-7 text-freelio-muted">L’identité de l’entreprise, le logo et les réglages métier seront renseignés à l’étape suivante.</p>

          <form action={formAction} className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="absolute -left-[9999px]" aria-hidden="true"><Label htmlFor="register-website">Site web</Label><Input id="register-website" name="website" tabIndex={-1} autoComplete="off" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="register-name">Nom complet</Label><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-freelio-muted" /><Input id="register-name" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Votre nom" className="h-11 pl-10" /></div></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="register-email">Adresse e-mail professionnelle</Label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-freelio-muted" /><Input id="register-email" name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr" className="h-11 pl-10" /></div></div>
            <div className="space-y-2"><Label htmlFor="register-password">Mot de passe</Label><div className="relative"><KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-freelio-muted" /><Input id="register-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="12 caractères minimum" className="h-11 pl-10" /></div></div>
            <div className="space-y-2"><Label htmlFor="register-confirm">Confirmation</Label><Input id="register-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="Répétez le mot de passe" className="h-11" /></div>
            <p className="sm:col-span-2 text-xs leading-5 text-freelio-muted">Utilisez au moins 12 caractères avec une majuscule, une minuscule et un chiffre.</p>
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-freelio-line bg-freelio-canvas p-3.5 text-sm leading-5"><input name="acceptTerms" type="checkbox" required className="mt-0.5 size-4 accent-freelio-accent" /><span>J’accepte les <Link href="/conditions" className="font-medium text-freelio-accent hover:underline">conditions d’utilisation</Link> et la <Link href="/confidentialite" className="font-medium text-freelio-accent hover:underline">politique de confidentialité</Link>.</span></label>
            <Button type="submit" size="lg" disabled={isPending} className="group sm:col-span-2">{isPending ? <><Loader2 className="animate-spin" />Création en cours</> : <>Créer mon espace<ArrowRight className="transition-transform group-hover:translate-x-0.5" /></>}</Button>
            <p aria-live="polite" className="sr-only">{state.error ?? ""}</p>
          </form>
        </div>
        <p className="text-xs text-freelio-muted"><ShieldCheck className="mr-1 inline size-3.5 text-freelio-success" />Mot de passe dérivé avec scrypt et sel unique ; aucune valeur en clair n’est stockée.</p>
      </section>

      <aside className="relative hidden overflow-hidden bg-freelio-canvas p-12 lg:flex lg:items-center lg:justify-center">
        <div className="absolute inset-0 marketing-dot-grid opacity-50" />
        <div className="relative w-full max-w-xl rounded-3xl border border-freelio-line bg-white p-8 shadow-freelio-stage xl:p-10">
          <span className="grid size-12 place-items-center rounded-2xl bg-freelio-accent text-white"><Building2 className="size-6" /></span>
          <h2 className="marketing-display mt-6 text-3xl font-semibold">Un espace vierge, configuré à votre nom.</h2>
          <p className="mt-4 leading-7 text-freelio-muted">Aucune identité client n’est inscrite dans le logiciel. Votre profil pilote l’interface, les documents et le portail.</p>
          <div className="mt-8 space-y-4">{benefits.map((benefit) => <div key={benefit} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-freelio-success" /><p className="text-sm leading-6">{benefit}</p></div>)}</div>
        </div>
      </aside>
    </main>
  )
}
