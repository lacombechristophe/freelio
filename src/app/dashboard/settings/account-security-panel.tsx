"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { KeyRound, Loader2, LogOut, QrCode, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { beginMfaSetup, changePassword, confirmMfaSetup, disableMfa, revokeAllSessions, rotateMfaRecoveryCodes } from "@/actions/auth/security"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Setup = { secret: string; qrCodeDataUrl: string } | null

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Opération impossible" }

export function AccountSecurityPanel({ mfaEnabled, recoveryCodesRemaining, hasPassword }: { mfaEnabled: boolean; recoveryCodesRemaining: number; hasPassword: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [setup, setSetup] = useState<Setup>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])

  const run = (operation: () => Promise<unknown>, success: string, signOut = false) => start(async () => {
    try { await operation(); toast.success(success); if (signOut) { router.replace("/auth/login"); router.refresh() } }
    catch (error) { toast.error(errorMessage(error)) }
  })

  return <div className="grid gap-4 xl:grid-cols-2">
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" />Mot de passe</CardTitle><CardDescription>Sa modification ferme immédiatement toutes les sessions.</CardDescription></CardHeader><CardContent>
      {hasPassword ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => changePassword(Object.fromEntries(form)), "Mot de passe modifié", true) }}>
        <div><Label htmlFor="currentPassword">Mot de passe actuel</Label><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
        <div><Label htmlFor="newPassword">Nouveau mot de passe</Label><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></div>
        <div><Label htmlFor="confirmPassword">Confirmation</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></div>
        <Button disabled={pending}>{pending && <Loader2 className="animate-spin" />}Changer le mot de passe</Button>
      </form> : <p className="text-sm text-muted-foreground">Ce compte utilise uniquement un lien de connexion. Demandez une réinitialisation depuis la page de connexion pour définir un mot de passe.</p>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" />Double authentification</CardTitle><CardDescription>Compatible avec toute application TOTP. Dix codes de secours à usage unique sont fournis.</CardDescription></CardHeader><CardContent className="space-y-4">
      {!mfaEnabled && !setup && hasPassword && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const password = String(new FormData(event.currentTarget).get("password") || ""); start(async () => { try { setSetup(await beginMfaSetup({ password })) } catch (error) { toast.error(errorMessage(error)) } }) }}><div><Label htmlFor="mfaPassword">Confirmez votre mot de passe</Label><Input id="mfaPassword" name="password" type="password" required /></div><Button variant="outline" disabled={pending}><QrCode />Configurer</Button></form>}
      {setup && <div className="space-y-4"><Image src={setup.qrCodeDataUrl} alt="QR code de configuration de la double authentification" width={220} height={220} unoptimized className="rounded-xl border" /><p className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{setup.secret}</p><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const code = String(new FormData(event.currentTarget).get("code") || ""); start(async () => { try { const result = await confirmMfaSetup({ code }); setRecoveryCodes(result.recoveryCodes); setSetup(null); toast.success("Double authentification activée") } catch (error) { toast.error(errorMessage(error)) } }) }}><Input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code à 6 chiffres" required /><Button disabled={pending}>Activer</Button></form></div>}
      {mfaEnabled && <><p className="text-sm"><span className="font-semibold text-emerald-700">Active</span> · {recoveryCodesRemaining} code(s) de secours restant(s)</p><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const code = String(new FormData(event.currentTarget).get("code") || ""); start(async () => { try { const result = await rotateMfaRecoveryCodes({ code }); setRecoveryCodes(result.recoveryCodes); toast.success("Codes renouvelés") } catch (error) { toast.error(errorMessage(error)) } }) }}><Input name="code" placeholder="Code TOTP ou de secours" required /><Button variant="outline" disabled={pending}>Renouveler les codes</Button></form><form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => disableMfa(Object.fromEntries(form)), "Double authentification désactivée", true) }}><Input name="password" type="password" placeholder="Mot de passe" required /><Input name="code" placeholder="Code de sécurité" required /><Button variant="destructive" className="sm:col-span-2" disabled={pending}>Désactiver et fermer les sessions</Button></form></>}
      {recoveryCodes.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">Copiez ces codes maintenant : ils ne seront plus affichés.</p><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">{recoveryCodes.map((code) => <span key={code}>{code}</span>)}</div></div>}
    </CardContent></Card>

    <Card className="xl:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LogOut className="size-4" />Sessions actives</CardTitle><CardDescription>Déconnecte tous les navigateurs et appareils, y compris celui-ci.</CardDescription></CardHeader><CardContent>{hasPassword ? <form className="flex max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); const password = String(new FormData(event.currentTarget).get("password") || ""); run(() => revokeAllSessions({ password }), "Toutes les sessions sont fermées", true) }}><Input name="password" type="password" placeholder="Confirmez votre mot de passe" required /><Button variant="outline" disabled={pending}>Tout déconnecter</Button></form> : <p className="text-sm text-muted-foreground">Définissez d’abord un mot de passe pour utiliser cette commande sensible.</p>}</CardContent></Card>
  </div>
}
