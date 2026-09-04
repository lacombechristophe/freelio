"use client"

import { useId, useTransition } from "react"
import { FilePenLine, Plus, Save, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { archiveServiceMacro, createServiceMacro, updateServiceMacro } from "@/actions/service-macros"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/shared/confirm-provider"

type Macro = Awaited<ReturnType<typeof import("@/actions/service-macros").getServiceMacros>>[number]

function MacroFields({ macro }: { macro?: Macro }) {
  const fieldId = useId()
  const context = macro ? ` de la macro ${macro.name}` : ""

  return <><div className="space-y-1.5"><Label htmlFor={`${fieldId}-name`}>Nom interne</Label><Input id={`${fieldId}-name`} aria-label={macro ? `Nom interne${context}` : undefined} name="name" required minLength={2} maxLength={120} defaultValue={macro?.name || ""} placeholder="Confirmation de prise en charge" /></div><div className="space-y-1.5"><Label htmlFor={`${fieldId}-subject`}>Objet</Label><Input id={`${fieldId}-subject`} aria-label={macro ? `Objet${context}` : undefined} name="subject" required minLength={2} maxLength={180} defaultValue={macro?.subject || ""} placeholder="{{ticket.number}} · prise en charge de votre demande" /></div><div className="space-y-1.5"><Label htmlFor={`${fieldId}-body`}>Message</Label><Textarea id={`${fieldId}-body`} aria-label={macro ? `Message${context}` : undefined} name="bodyText" required minLength={3} maxLength={10_000} rows={7} defaultValue={macro?.bodyText || ""} placeholder={"Bonjour {{contact.firstName}},\n\nVotre demande {{ticket.number}} est prise en charge par notre équipe."} /></div></>
}

function payload(form: HTMLFormElement) {
  const data = new FormData(form)
  return { name: data.get("name"), subject: data.get("subject"), bodyText: data.get("bodyText") }
}

export function ServiceMacrosManager({ macros }: { macros: Macro[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const run = (operation: () => Promise<unknown>, success: string, reset?: HTMLFormElement) => startTransition(() => void operation().then(() => { reset?.reset(); toast.success(success); router.refresh() }).catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))
  return <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
    <Card><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Nouvelle macro</CardTitle><HelpTip label="Variables disponibles">ticket.number, ticket.title, client.name, contact.firstName, contact.lastName, assigned.name et company.name sont remplacées lors de l’insertion.</HelpTip></div><CardDescription>Le contenu reste modifiable avant l’envoi. Aucun message ne part automatiquement.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => createServiceMacro(payload(event.currentTarget)), "Macro SAV créée.", event.currentTarget) }}><MacroFields /><Button type="submit" disabled={pending}><Plus />Créer la macro</Button></form></CardContent></Card>
    <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Bibliothèque active</h2><p className="mt-1 text-xs text-muted-foreground">{macros.length} macro(s), disponibles directement dans chaque ticket.</p></div>{macros.length ? <div className="divide-y">{macros.map((macro) => <details key={macro.id} className="group"><summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-muted/30"><FilePenLine className="size-4 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{macro.name}</span><span className="block truncate text-xs text-muted-foreground">{macro.subject}</span></span><span className="text-xs text-muted-foreground">Modifier</span></summary><div className="grid gap-4 border-t bg-muted/10 p-5 lg:grid-cols-2"><form key={macro.updatedAt.toString()} className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => updateServiceMacro(macro.id, payload(event.currentTarget)), "Macro SAV mise à jour.") }}><MacroFields macro={macro} /><div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={pending}><Save />Enregistrer</Button><Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => void confirm({ title: `Archiver « ${macro.name} » ?`, description: "Elle ne sera plus proposée dans les tickets.", confirmLabel: "Archiver", destructive: true }).then((accepted) => { if (accepted) run(() => archiveServiceMacro(macro.id), "Macro SAV archivée.") })}><Trash2 />Archiver</Button></div></form><div><p className="mb-2 text-xs font-semibold text-muted-foreground">Aperçu avant personnalisation</p><div className="overflow-hidden rounded-xl border bg-background"><div className="border-b px-4 py-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objet</p><p className="mt-1 text-sm font-semibold">{macro.subject}</p></div><p className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-muted-foreground">{macro.bodyText}</p></div></div></div></details>)}</div> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">Aucune macro active. Créez la première réponse réutilisable.</p>}</section>
  </div>
}
