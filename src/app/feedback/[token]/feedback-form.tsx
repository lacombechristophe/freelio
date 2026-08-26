"use client"

import * as React from "react"
import { CheckCircle2, Send } from "lucide-react"
import { toast } from "sonner"

import { submitPublicSatisfactionResponse } from "@/actions/service-content"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function FeedbackForm({ token, scaleMin, scaleMax, type, followUpQuestion }: { token: string; scaleMin: number; scaleMax: number; type: string; followUpQuestion: string | null }) {
  const [score, setScore] = React.useState<number | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [complete, setComplete] = React.useState(false)
  if (complete) return <div className="py-8 text-center"><CheckCircle2 className="mx-auto size-12 text-emerald-600" /><h2 className="mt-4 text-xl font-semibold">Merci pour votre retour</h2><p className="mt-2 text-sm text-muted-foreground">Votre réponse a été transmise à l’équipe.</p></div>
  const values = Array.from({ length: scaleMax - scaleMin + 1 }, (_, index) => scaleMin + index)
  return <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); if (score == null) return toast.error("Choisissez une note."); const data = new FormData(event.currentTarget); startTransition(() => void submitPublicSatisfactionResponse(token, { score, comment: data.get("comment") }).then(() => setComplete(true)).catch((error) => toast.error(error instanceof Error ? error.message : "Réponse impossible."))) }}><fieldset><legend className="text-sm font-medium">Votre note</legend><div className={`mt-3 grid gap-2 ${values.length > 7 ? "grid-cols-6 sm:grid-cols-11" : "grid-cols-5"}`}>{values.map((value) => <button key={value} type="button" onClick={() => setScore(value)} aria-pressed={score === value} className={`aspect-square rounded-xl border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25 ${score === value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-white hover:border-primary/40 hover:bg-primary/5"}`}>{value}</button>)}</div>{type === "NPS" && <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>Pas du tout probable</span><span>Tout à fait probable</span></div>}</fieldset><div><Label htmlFor="feedback-comment">{followUpQuestion || "Souhaitez-vous préciser votre réponse ?"}</Label><Textarea id="feedback-comment" name="comment" rows={5} className="mt-2" maxLength={3000} placeholder="Votre commentaire (facultatif)" /></div><Button type="submit" disabled={pending || score == null}>{pending ? <Send className="animate-pulse" /> : <Send />}Envoyer ma réponse</Button></form>
}

