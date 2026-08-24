"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Building2, FileText, CreditCard, User, Zap, Trash2, Database, Download, Save, Check
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { updateCompany } from "@/actions/settings"
import { anonymizeAccount } from "@/actions/compliance"
import { exportUserData } from "@/actions/compliance"
import { cn } from "@/lib/utils"

type PdfTemplate = "MINIMAL" | "PROFESSIONAL" | "MODERN"

const PDF_TEMPLATE_OPTIONS: Array<{
  value: PdfTemplate
  label: string
  description: string
}> = [
  {
    value: "MINIMAL",
    label: "Minimal",
    description: "Sobre, lisible, proche d'une facture classique.",
  },
  {
    value: "PROFESSIONAL",
    label: "Professionnel",
    description: "En-tête structuré et présentation plus corporate.",
  },
  {
    value: "MODERN",
    label: "Moderne",
    description: "Bandeau fort, montant mis en avant, rendu premium.",
  },
]

type Company = {
  id: string
  name: string
  fullName?: string | null
  siret?: string | null
  address?: string | null
  email?: string | null
  phone?: string | null
  logo?: string | null
  brandColor?: string | null
  apeCode?: string | null
  rcsNumber?: string | null
  isTvaApplicable: boolean
  latePenaltyRate: number
  invoicePrefix: string
  quotePrefix: string
  pdfTemplate?: string | null
  eInvoicePlatform?: string | null
  eInvoiceRoutingId?: string | null
}

type User = {
  aiUsageCount?: number
}

function getErrorMessage(error: unknown, fallback = "Erreur.") {
  return error instanceof Error ? error.message : fallback
}

export function SettingsClient({ company, user }: { company: Company; user: User }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  // Billing states
  const [tvaSwitch, setTvaSwitch] = useState(!company.isTvaApplicable) // checked = Franchise TVA active (i.e. isTvaApplicable = false)
  const [penalty, setPenalty] = useState(company.latePenaltyRate.toString())
  const [invoicePrefix, setInvoicePrefix] = useState(company.invoicePrefix ?? "FACT-")
  const [quotePrefix, setQuotePrefix] = useState(company.quotePrefix ?? "DEV-")
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>(
    PDF_TEMPLATE_OPTIONS.some((option) => option.value === company.pdfTemplate)
      ? (company.pdfTemplate as PdfTemplate)
      : "MINIMAL"
  )
  const [eInvoicePlatform, setEInvoicePlatform] = useState(company.eInvoicePlatform ?? "")
  const [eInvoiceRoutingId, setEInvoiceRoutingId] = useState(company.eInvoiceRoutingId ?? "")

  function handleSaveEnterprise(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateCompany({
        name: form.get("name") as string,
        fullName: form.get("fullName") as string,
        siret: form.get("siret") as string,
        address: form.get("address") as string,
        apeCode: form.get("ape") as string,
        rcsNumber: form.get("rcs") as string,
        email: form.get("email") as string,
        phone: form.get("phone") as string,
        logo: form.get("logo") as string,
        brandColor: form.get("brandColor") as string,
      })
      if (result?.success) {
        toast.success("Paramètres entreprise sauvegardés.")
        router.refresh()
      } else {
        toast.error(result?.error ?? "Erreur lors de la sauvegarde.")
      }
    })
  }

  function handleSaveBilling(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const cleanedPenalty = Number(penalty.replace("%", "").trim())
      const result = await updateCompany({
        name: company.name, // required by CompanySchema
        isTvaApplicable: !tvaSwitch, // if franchise checked, then TVA applicable = false
        latePenaltyRate: isNaN(cleanedPenalty) ? 0 : cleanedPenalty,
        invoicePrefix,
        quotePrefix,
        pdfTemplate,
        eInvoicePlatform,
        eInvoiceRoutingId,
      })
      if (result?.success) {
        toast.success("Paramètres de facturation sauvegardés.")
        router.refresh()
      } else {
        toast.error(result?.error ?? "Erreur lors de la sauvegarde.")
      }
    })
  }

  function handleExport() {
    startTransition(async () => {
      try {
        const payload = await exportUserData()
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json;charset=utf-8",
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `export-rgpd-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        toast.success("Export JSON téléchargé.")
      } catch (err) {
        toast.error(getErrorMessage(err, "Erreur lors de l'export."))
      }
    })
  }

  function handleLocalBackup() {
    toast.success("Préparation de la sauvegarde locale.")
    window.location.assign("/api/backup/export")
  }

  function handleDeleteAccount() {
    if (deleteConfirm !== "SUPPRIMER") return
    startTransition(async () => {
      await anonymizeAccount()
      setDeleteOpen(false)
      toast.success("Votre compte a été anonymisé.")
      router.push("/")
    })
  }

  return (
    <Tabs defaultValue="enterprise" className="space-y-4">
      <TabsList className="h-auto min-h-10 max-w-full justify-start overflow-x-auto bg-muted/60 p-1">
        <TabsTrigger value="enterprise" className="gap-2">
          <Building2 className="h-4 w-4" /> Entreprise
        </TabsTrigger>
        <TabsTrigger value="billing" className="gap-2">
          <CreditCard className="h-4 w-4" /> Facturation
        </TabsTrigger>
        <TabsTrigger value="integrations" className="gap-2">
          <Zap className="h-4 w-4" /> Intégrations
        </TabsTrigger>
        <TabsTrigger value="account" className="gap-2">
          <User className="h-4 w-4" /> Compte
        </TabsTrigger>
      </TabsList>

      <TabsContent value="enterprise" className="space-y-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Informations Légales</CardTitle>
            <CardDescription className="text-xs">Ces détails apparaissent sur vos documents officiels.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEnterprise} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold">Raison sociale *</Label>
                  <Input id="name" name="name" defaultValue={company.name} required className="bg-background border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-semibold">Représentant légal</Label>
                  <Input id="fullName" name="fullName" defaultValue={company.fullName ?? ""} className="bg-background border-border" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div className="space-y-1.5">
                  <Label htmlFor="logo" className="text-xs font-semibold">Logo de l’entreprise</Label>
                  <Input id="logo" name="logo" type="url" defaultValue={company.logo ?? ""} placeholder="https://…/logo.svg" className="bg-background border-border" />
                  <p className="text-xs text-muted-foreground">Utilisé dans la navigation et les documents. Laissez vide pour afficher l’initiale du nom.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brandColor" className="text-xs font-semibold">Couleur principale</Label>
                  <Input id="brandColor" name="brandColor" type="color" defaultValue={company.brandColor ?? "#1f4ed8"} className="h-10 bg-background p-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="siret" className="text-xs font-semibold">SIRET</Label>
                  <Input id="siret" name="siret" defaultValue={company.siret ?? ""} className="bg-background border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-xs font-semibold">Adresse</Label>
                  <Input id="address" name="address" defaultValue={company.address ?? ""} className="bg-background border-border" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">E-mail de l’entreprise</Label>
                  <Input id="email" name="email" type="email" defaultValue={company.email ?? ""} className="bg-background border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">Téléphone</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={company.phone ?? ""} className="bg-background border-border" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ape" className="text-xs font-semibold">Code APE</Label>
                  <Input id="ape" name="ape" defaultValue={company.apeCode ?? ""} className="bg-background border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rcs" className="text-xs font-semibold">RCS / RM</Label>
                  <Input id="rcs" name="rcs" defaultValue={company.rcsNumber ?? ""} className="bg-background border-border" />
                </div>
              </div>
              <Button type="submit" disabled={isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {isPending ? "Sauvegarde…" : "Enregistrer les modifications"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="billing" className="space-y-4">
        <form onSubmit={handleSaveBilling}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">TVA, documents et facturation électronique</CardTitle>
              <CardDescription className="text-xs">Paramétrez le régime de TVA, les documents commerciaux et les informations de routage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-foreground">TVA non applicable</Label>
                  <p className="text-xs text-muted-foreground leading-normal max-w-sm">
                    Si activé, les nouveaux documents utilisent un taux de TVA à 0 %. Validez le motif et la mention applicables avec votre cabinet comptable.
                  </p>
                </div>
                <Switch 
                  checked={tvaSwitch} 
                  onCheckedChange={(checked) => setTvaSwitch(checked)} 
                />
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Modèle PDF</Label>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Ce modèle est utilisé pour les factures et devis générés en PDF.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {PDF_TEMPLATE_OPTIONS.map((option) => {
                    const active = pdfTemplate === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPdfTemplate(option.value)}
                        className={cn(
                          "group rounded-lg border p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-bold">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            {option.label}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <div
                          className={cn(
                            "mt-3 h-20 rounded-md border bg-card p-2",
                            active ? "border-primary/30" : "border-border"
                          )}
                        >
                          <div
                            className={cn(
                              "h-2 w-16 rounded-sm",
                              option.value === "MODERN" ? "bg-foreground" : "bg-primary"
                            )}
                          />
                          <div className="mt-3 grid grid-cols-3 gap-1.5">
                            <div className="h-8 rounded-sm bg-muted" />
                            <div className="h-8 rounded-sm bg-muted" />
                            <div className="h-8 rounded-sm bg-primary/20" />
                          </div>
                          <div className="mt-3 h-1.5 w-full rounded-sm bg-muted" />
                          <div className="mt-1.5 h-1.5 w-2/3 rounded-sm bg-muted" />
                        </div>
                        <p className="mt-2 text-xs leading-normal text-muted-foreground">
                          {option.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="eInvoicePlatform" className="text-xs font-semibold">Plateforme agréée choisie</Label>
                  <Input id="eInvoicePlatform" value={eInvoicePlatform} onChange={(event) => setEInvoicePlatform(event.target.value)} placeholder="Nom de la plateforme" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eInvoiceRoutingId" className="text-xs font-semibold">Identifiant de routage</Label>
                  <Input id="eInvoiceRoutingId" value={eInvoiceRoutingId} onChange={(event) => setEInvoiceRoutingId(event.target.value)} placeholder="SIREN, adresse ou identifiant fourni" />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="penalty" className="text-xs font-semibold">Pénalités de retard par défaut (%) *</Label>
                  <Input 
                    id="penalty"
                    value={penalty} 
                    onChange={(e) => setPenalty(e.target.value)} 
                    placeholder="Ex: 12.25"
                    required
                    className="bg-background border-border max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground leading-normal">
                    Taux légal annuel obligatoire en cas de retard de paiement (ex: 12.25%).
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invoicePrefix" className="text-xs font-semibold">Préfixe de facturation *</Label>
                  <Input 
                    id="invoicePrefix"
                    value={invoicePrefix} 
                    onChange={(e) => setInvoicePrefix(e.target.value)} 
                    placeholder="FACT-"
                    required
                    className="bg-background border-border max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground leading-normal">
                    Préfixe par défaut des numéros de factures (ex: &quot;FACT-&quot;).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quotePrefix" className="text-xs font-semibold">Préfixe de devis *</Label>
                  <Input 
                    id="quotePrefix"
                    value={quotePrefix} 
                    onChange={(e) => setQuotePrefix(e.target.value)} 
                    placeholder="DEV-"
                    required
                    className="bg-background border-border max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground leading-normal">
                    Préfixe par défaut des numéros de devis (ex: &quot;DEV-&quot;).
                  </p>
                </div>
              </div>
              <Button type="submit" disabled={isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {isPending ? "Sauvegarde…" : "Enregistrer la facturation"}
              </Button>
            </CardContent>
          </Card>
        </form>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Assistant IA</CardTitle>
            <CardDescription className="text-xs">Consommation de ressources d&apos;intelligence artificielle.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium">Appels à l&apos;assistant (OCR Vision & Aide rédactionnelle)</span>
                <span className="text-xs font-bold text-primary">{user.aiUsageCount ?? 0} / 500</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-colors"
                  style={{ width: `${Math.min(100, ((user.aiUsageCount ?? 0) / 500) * 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="integrations" className="space-y-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Services Tiers</CardTitle>
            <CardDescription className="text-xs">Connectez vos outils pour automatiser votre gestion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-background/50 border-border">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-primary/10 rounded flex items-center justify-center text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">Google Gemini AI</p>
                  <p className="text-xs text-muted-foreground">Lecture intelligente des reçus & Aide à la rédaction légale</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="pointer-events-none">Actif</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="account" className="space-y-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Sauvegardes et portabilité</CardTitle>
            <CardDescription className="text-xs">
              Téléchargez vos données pour sécuriser votre installation locale.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                  <p className="font-bold text-sm text-foreground">Export de réversibilité contrôlé</p>
                  <p className="text-xs text-muted-foreground">
                    JSON vérifiable des données métier et fichiers lisibles, sans jetons, identifiants de connexion, secrets webhook ni IBAN chiffré.
                  </p>
              </div>
              <Button variant="outline" className="gap-2 shrink-0" onClick={handleLocalBackup}>
                <Database className="h-4 w-4" /> Exporter
              </Button>
            </div>
            <Separator />
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">
              La restauration complète s&apos;effectue par PostgreSQL et R2 dans un environnement isolé, selon le runbook de production. L&apos;export JSON sert au contrôle de portabilité et à une reprise logique assistée ; il ne réinjecte jamais automatiquement des secrets ou des sessions.
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="font-bold text-sm text-foreground">Exporter mes données</p>
                <p className="text-xs text-muted-foreground italic">Export JSON de portabilité (RGPD Art. 20).</p>
              </div>
              <Button variant="outline" className="gap-2 shrink-0" onClick={handleExport} disabled={isPending}>
                <Download className="h-4 w-4" /> Export RGPD
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-danger/25 bg-card">
          <CardHeader>
            <CardTitle className="text-danger text-sm font-semibold">Zone de danger</CardTitle>
            <CardDescription className="text-xs">Actions irréversibles sur votre compte.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-bold text-sm text-danger">Supprimer mon compte</p>
                <p className="text-xs text-muted-foreground">Anonymisation RGPD (documents légaux conservés 10 ans).</p>
              </div>
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger render={<Button variant="destructive" className="gap-2" />}>
                  <Trash2 className="h-4 w-4" /> Supprimer
                </DialogTrigger>
                <DialogContent className="bg-popover border text-popover-foreground">
                  <DialogHeader>
                    <DialogTitle>Confirmer la suppression</DialogTitle>
                    <DialogDescription>
                      Cette action est <strong>irréversible</strong>. Vos données personnelles seront anonymisées.
                      Les documents légaux (factures, contrats) sont conservés 10 ans conformément à la loi.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <Label>Tapez <strong>SUPPRIMER</strong> pour confirmer</Label>
                    <Input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="SUPPRIMER"
                      className="bg-background border-border"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
                    <Button
                      variant="destructive"
                      disabled={deleteConfirm !== "SUPPRIMER" || isPending}
                      onClick={handleDeleteAccount}
                    >
                      {isPending ? "Suppression…" : "Supprimer définitivement"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
