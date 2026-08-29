"use client"

import { useId, useTransition } from "react"
import { ClipboardCheck, Plus, Save, ShieldCheck, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  archiveServiceDiagnosticGuide,
  createServiceDiagnosticGuide,
  updateServiceDiagnosticGuide,
} from "@/actions/service-diagnostics"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Guide = Awaited<ReturnType<typeof import("@/actions/service-diagnostics").getServiceDiagnosticGuides>>[number]

function Fields({ guide }: { guide?: Guide }) {
  const id = useId()
  const steps = guide?.steps.map((step) => `${step.required ? "" : "? "}${step.label}`).join("\n") || ""
  return <div className="grid gap-4 lg:grid-cols-2">
    <div className="space-y-1.5 lg:col-span-2">
      <Label htmlFor={`${id}-name`}>Nom interne</Label>
      <Input id={`${id}-name`} name="name" required minLength={2} maxLength={120} defaultValue={guide?.name || ""} placeholder="Couverture motorisée · blocage à mi-course" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-category`}>Gamme ou catégorie</Label>
      <Input id={`${id}-category`} name="productCategory" maxLength={120} defaultValue={guide?.productCategory || ""} placeholder="Couverture automatique" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-manufacturer`}>Fabricant</Label>
      <Input id={`${id}-manufacturer`} name="manufacturer" maxLength={120} defaultValue={guide?.manufacturer || ""} placeholder="Laisser vide pour toutes les marques" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-model`}>Référence ou famille de modèle</Label>
      <Input id={`${id}-model`} name="modelPattern" maxLength={120} defaultValue={guide?.modelPattern || ""} placeholder="M-200" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-priority`}>Priorité de suggestion</Label>
      <Input id={`${id}-priority`} name="priority" type="number" min={0} max={10} defaultValue={guide?.priority || 0} />
    </div>
    <div className="space-y-1.5 lg:col-span-2">
      <Label htmlFor={`${id}-symptom`}>Symptôme de référence</Label>
      <Input id={`${id}-symptom`} name="symptom" required minLength={2} maxLength={240} defaultValue={guide?.symptom || ""} placeholder="Le moteur force puis la couverture se bloque" />
    </div>
    <div className="space-y-1.5 lg:col-span-2">
      <Label htmlFor={`${id}-keywords`}>Mots-clés reconnus</Label>
      <Input id={`${id}-keywords`} name="keywordsText" defaultValue={guide?.keywords.join(", ") || ""} placeholder="moteur, blocage, code E12" />
      <p className="text-[11px] leading-5 text-muted-foreground">Séparez les termes par des virgules. Ils aident au classement, sans déclencher d’action automatique.</p>
    </div>
    <div className="space-y-1.5 lg:col-span-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={`${id}-steps`}>Points de contrôle</Label>
        <HelpTip label="Obligatoire ou optionnel">Un contrôle par ligne. Préfixez une ligne par ? pour la rendre optionnelle.</HelpTip>
      </div>
      <Textarea id={`${id}-steps`} name="stepsText" required minLength={3} rows={7} defaultValue={steps} placeholder={"Couper et consigner l’alimentation\nRelever le code erreur\nContrôler les fins de course\n? Photographier le coffret"} />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-warranty`}>Consigne sous garantie</Label>
      <Textarea id={`${id}-warranty`} name="warrantyInstructions" rows={4} defaultValue={guide?.warrantyInstructions || ""} placeholder="Ne pas démonter le moteur avant accord fabricant…" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-out-warranty`}>Consigne hors garantie</Label>
      <Textarea id={`${id}-out-warranty`} name="outOfWarrantyInstructions" rows={4} defaultValue={guide?.outOfWarrantyInstructions || ""} placeholder="Chiffrer diagnostic, déplacement et pièces avant intervention…" />
    </div>
    <div className="space-y-1.5 lg:col-span-2">
      <Label htmlFor={`${id}-hints`}>Issues et actions possibles</Label>
      <Textarea id={`${id}-hints`} name="resolutionHintsText" rows={5} defaultValue={guide?.resolutionHints.join("\n") || ""} placeholder={"Réglage des fins de course\nRemplacement du condensateur\nEscalade vers le support fabricant"} />
    </div>
  </div>
}

function payload(form: HTMLFormElement) {
  const data = new FormData(form)
  return {
    name: data.get("name"),
    productCategory: data.get("productCategory"),
    manufacturer: data.get("manufacturer"),
    modelPattern: data.get("modelPattern"),
    symptom: data.get("symptom"),
    keywordsText: data.get("keywordsText"),
    stepsText: data.get("stepsText"),
    resolutionHintsText: data.get("resolutionHintsText"),
    warrantyInstructions: data.get("warrantyInstructions"),
    outOfWarrantyInstructions: data.get("outOfWarrantyInstructions"),
    priority: data.get("priority"),
  }
}

export function ServiceDiagnosticsManager({ guides }: { guides: Guide[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const run = (operation: () => Promise<unknown>, success: string, reset?: HTMLFormElement) => startTransition(() => void operation()
    .then(() => { reset?.reset(); toast.success(success); router.refresh() })
    .catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))

  return <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nouveau guide</CardTitle>
        <CardDescription>Les critères vides restent génériques. Les guides les plus précis sont suggérés en premier sur le ticket.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => createServiceDiagnosticGuide(payload(event.currentTarget)), "Guide de diagnostic créé.", event.currentTarget) }}>
          <Fields />
          <Button type="submit" disabled={pending}><Plus />Créer le guide</Button>
        </form>
      </CardContent>
    </Card>

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Bibliothèque active</h2>
        <p className="mt-1 text-xs text-muted-foreground">{guides.length} guide(s), disponibles dans les tickets SAV.</p>
      </div>
      {guides.length ? <div className="divide-y">{guides.map((guide) => <details key={guide.id} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-muted/30">
          <ClipboardCheck className="size-4 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{guide.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{[guide.productCategory, guide.manufacturer, guide.modelPattern].filter(Boolean).join(" · ") || "Guide générique"} · {guide.steps.length} contrôle(s)</span>
          </span>
          <span className="text-xs text-muted-foreground">Modifier</span>
        </summary>
        <div className="border-t bg-muted/10 p-5">
          <form key={guide.updatedAt.toString()} className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => updateServiceDiagnosticGuide(guide.id, payload(event.currentTarget)), "Guide de diagnostic mis à jour.") }}>
            <Fields guide={guide} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={pending}><Save />Enregistrer</Button>
              <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => void confirm({ title: `Archiver « ${guide.name} » ?`, description: "Il ne sera plus proposé, mais les diagnostics déjà consignés resteront intacts.", confirmLabel: "Archiver", destructive: true }).then((accepted) => { if (accepted) run(() => archiveServiceDiagnosticGuide(guide.id), "Guide archivé.") })}><Trash2 />Archiver</Button>
            </div>
          </form>
        </div>
      </details>)}</div> : <div className="px-5 py-14 text-center">
        <ShieldCheck className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Aucun guide actif</p>
        <p className="mt-1 text-xs text-muted-foreground">Commencez par le symptôme le plus fréquent de votre parc installé.</p>
      </div>}
    </section>
  </div>
}
