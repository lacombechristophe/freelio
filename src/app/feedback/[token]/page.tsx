import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import { CheckCircle2, MessageSquareHeart, ShieldCheck } from "lucide-react"

import { getPublicSatisfactionRequest } from "@/actions/service-content"
import { FeedbackForm } from "./feedback-form"

export const metadata: Metadata = { title: "Votre avis", robots: { index: false, follow: false, nocache: true } }
export const dynamic = "force-dynamic"

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const request = await getPublicSatisfactionRequest(token)
  if (!request) return <Unavailable text="Ce lien est invalide ou n’est plus disponible." />
  if (request.status === "RESPONDED") return <Unavailable success text="Merci, votre réponse a bien été enregistrée." />
  if (request.status !== "PENDING" || new Date(request.expiresAt) <= new Date()) return <Unavailable text="Cette enquête a expiré ou a été clôturée." />
  const style = { "--primary": request.company.brandColor || "#1768ff" } as CSSProperties
  const recipient = request.survey.anonymous ? null : request.contact?.firstName

  return <main style={style} className="grid min-h-screen place-items-center bg-[#f7f9fc] px-4 py-10"><section className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-sm"><header className="border-b p-6 sm:p-8"><div className="flex items-center gap-3">{request.company.logo ? <Image src={request.company.logo} alt="" width={44} height={44} unoptimized className="size-11 rounded-xl border object-contain" /> : <span className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{request.company.name.slice(0, 2).toUpperCase()}</span>}<div><p className="font-semibold">{request.company.name}</p><p className="text-xs text-muted-foreground">Questionnaire sécurisé</p></div></div><div className="mt-7"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquareHeart className="size-5" /></span><p className="mt-5 text-sm font-medium text-primary">{recipient ? `Bonjour ${recipient}` : "Votre avis compte"}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{request.survey.question}</h1>{request.serviceTicket && <p className="mt-3 text-sm text-muted-foreground">À propos de {request.serviceTicket.number} · {request.serviceTicket.title}</p>}</div></header><div className="p-6 sm:p-8"><FeedbackForm token={token} scaleMin={request.survey.scaleMin} scaleMax={request.survey.scaleMax} type={request.survey.type} followUpQuestion={request.survey.followUpQuestion} /></div><footer className="flex items-center gap-2 border-t bg-muted/20 px-6 py-4 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" />Lien personnel, chiffré en transit et sans identifiant visible.</footer></section></main>
}

function Unavailable({ text, success = false }: { text: string; success?: boolean }) { return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] px-4"><section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">{success ? <CheckCircle2 className="mx-auto size-10 text-emerald-600" /> : <ShieldCheck className="mx-auto size-10 text-muted-foreground" />}<h1 className="mt-5 text-xl font-semibold">{success ? "Réponse enregistrée" : "Enquête indisponible"}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p></section></main> }

