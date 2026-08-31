import { KeyRound } from "lucide-react"

import { AppBrand } from "@/components/shared/app-brand"
import { ResetPasswordForm } from "./reset-password-form"

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <main className="marketing-surface min-h-screen bg-freelio-canvas p-6 text-freelio-ink"><div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-center"><AppBrand href="/" /><section className="mt-8 rounded-2xl border border-freelio-line bg-white p-7 shadow-freelio-stage sm:p-9"><div className="grid size-11 place-items-center rounded-xl bg-[#eaf2ff] text-freelio-accent"><KeyRound className="size-5" /></div><h1 className="marketing-display mt-5 text-3xl font-semibold">Choisir un nouveau mot de passe</h1><p className="mt-3 text-sm leading-6 text-freelio-muted">Cette opération ferme toutes les autres sessions du compte.</p><ResetPasswordForm token={token} /></section></div></main>
}
