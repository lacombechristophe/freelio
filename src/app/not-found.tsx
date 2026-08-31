import Link from "next/link"
import { ArrowLeft, SearchX } from "lucide-react"

import { AppBrand } from "@/components/shared/app-brand"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return <main className="marketing-surface grid min-h-screen place-items-center bg-freelio-canvas px-6 py-12 text-freelio-ink"><section className="w-full max-w-xl rounded-3xl border border-freelio-line bg-white p-8 shadow-freelio-stage sm:p-12"><AppBrand href="/" /><span className="mt-10 grid size-12 place-items-center rounded-2xl bg-freelio-accent/10 text-freelio-accent"><SearchX className="size-5" /></span><p className="mt-6 text-sm font-semibold text-freelio-accent">Erreur 404</p><h1 className="marketing-display mt-2 text-4xl font-semibold">Cette page n’existe pas.</h1><p className="mt-4 leading-7 text-freelio-muted">Le lien est peut-être incomplet ou la ressource a été déplacée. Revenez à l’accueil pour reprendre votre navigation.</p><Button render={<Link href="/" />} className="mt-7"><ArrowLeft />Retour à l’accueil</Button></section></main>
}
