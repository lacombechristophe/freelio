"use client"

import Link from "next/link"
import { useActionState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { resetPassword, type PasswordResetState } from "@/actions/auth/password-reset"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: PasswordResetState = { success: false }

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initialState)
  if (state.success) return <div className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950"><CheckCircle2 className="mb-3 size-5" /><p>{state.message}</p><Link href="/auth/login" className={`${buttonVariants()} mt-5`}>Se connecter</Link></div>
  return <form action={action} className="mt-7 space-y-4">
    <input type="hidden" name="token" value={token} />
    <div className="space-y-2"><Label htmlFor="password">Nouveau mot de passe</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} /></div>
    <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmer le mot de passe</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} /></div>
    <p className="text-xs leading-5 text-freelio-muted">12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p>
    {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
    <Button className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Enregistrer le mot de passe</Button>
  </form>
}
