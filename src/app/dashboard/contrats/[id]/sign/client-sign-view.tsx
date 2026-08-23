"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { ShieldCheck, FileText, Eraser, BadgeAlert, CheckCircle, Scale, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { signContractPublic } from "@/actions/contrats"

import SignaturePad from "react-signature-canvas"

// Dynamically import the signature canvas with SSR disabled to prevent hydration errors
const SignatureCanvas = dynamic(() => import("react-signature-canvas"), { 
  ssr: false,
  loading: () => (
    <div className="h-44 w-full bg-background border rounded-md flex items-center justify-center text-muted-foreground text-xs animate-pulse">
      Chargement de la tablette de signature numérique…
    </div>
  )
}) as unknown as React.ComponentType<React.ComponentProps<typeof SignaturePad> & { ref?: React.Ref<SignaturePad> }>

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue lors de la signature."
}

interface ClientSignViewProps {
  token: string
  contract: {
    number: string
    title: string
    status: string
    content: string
    clientName: string
    validFrom: string | null
    validUntil: string | null
  }
}

export function ClientSignView({ token, contract }: ClientSignViewProps) {
  const [mounted, setMounted] = React.useState(false)
  const [signerName, setSignerName] = React.useState("")
  const [signerEmail, setSignerEmail] = React.useState("")
  const [agreedToClauses, setAgreedToClauses] = React.useState(false)
  const [agreedToElectronicSign, setAgreedToElectronicSign] = React.useState(false)
  
  const [pending, setPending] = React.useState(false)
  const [signedSuccess, setSignedSuccess] = React.useState(false)
  const [sealHash, setSealHash] = React.useState("")

  const sigCanvasRef = React.useRef<SignaturePad>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleClear = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear()
    }
  }

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!signerName.trim()) {
      return toast.error("Veuillez saisir votre nom complet.")
    }
    if (!signerEmail.trim() || !signerEmail.includes("@")) {
      return toast.error("Veuillez saisir une adresse email valide.")
    }
    if (!agreedToClauses || !agreedToElectronicSign) {
      return toast.error("Veuillez accepter les conditions légales obligatoires.")
    }

    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      return toast.error("Veuillez dessiner votre signature manuscrite dans le cadre.")
    }

    setPending(true)
    try {
      // Get base64 PNG data from canvas signature
      const canvasData = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png")

      // Perform signature request
      const res = await signContractPublic(token, {
        signerName,
        signerEmail,
        canvasData,
      })

      if (res.ok) {
        setSealHash(res.integrityHash)
        setSignedSuccess(true)
        toast.success("Le contrat a été signé électroniquement avec succès !")
      }
    } catch (err) {
      console.error(err)
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  // Success Confirmation Screen
  if (signedSuccess) {
    return (
      <Card className="border-success/30 bg-success/5 animate-in fade-in-50 duration-500 max-w-2xl mx-auto">
        <CardContent className="pt-8 pb-8 space-y-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle className="h-8 w-8" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-success">Contrat Signé avec Succès !</h2>
            <p className="text-sm text-muted-foreground">
              Le contrat <span className="font-mono font-bold text-foreground">{contract.number}</span> est scellé et archivé de manière sécurisée.
            </p>
          </div>

          {/* Cryptographic Seal Box */}
          <div className="bg-background/80 border border-success/15 rounded-lg p-5 text-left space-y-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 pb-2 border-b border-border/40 text-foreground font-bold">
              <ShieldCheck className="h-4 w-4 text-success" />
              CERTIFICAT D&apos;INTÉGRITÉ NUMÉRIQUE
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground text-xs leading-relaxed">
              <div>
                <span className="text-foreground font-bold">Signataire :</span> {signerName}
              </div>
              <div>
                <span className="text-foreground font-bold">Email :</span> {signerEmail}
              </div>
              <div>
                <span className="text-foreground font-bold">Piste d'audit :</span> enregistrée côté serveur
              </div>
              <div>
                <span className="text-foreground font-bold">Timestamp UTC :</span> {new Date().toUTCString()}
              </div>
            </div>

            <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground leading-normal">
              <span className="text-foreground font-bold">Empreinte SHA-256 scellée :</span>
              <p className="break-all font-mono text-xs text-success/80 mt-1 select-all">{sealHash}</p>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" className="gap-2" onClick={() => window.print()}>
              <Download className="h-4 w-4" />
              Télécharger ma copie (Imprimer)
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Already Signed Screen
  if (contract.status === "SIGNED") {
    return (
      <Card className="border-warning/30 bg-warning/5 max-w-md mx-auto">
        <CardContent className="pt-8 pb-8 space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-warning/15 flex items-center justify-center text-warning">
            <BadgeAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">Ce document a déjà été signé</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le contrat <span className="font-mono font-bold">{contract.number}</span> est déjà complété. Les signatures apposées sont immuables.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Scrollable contract viewer */}
      <div className="lg:col-span-7 space-y-4">
        <Card className="bg-card/40 backdrop-blur-xs border border-border">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-primary">{contract.number}</span>
              <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                CONTRAT DE PRESTATION
              </span>
            </div>
            <CardTitle className="text-lg font-black tracking-tight pt-1">{contract.title}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 max-h-[500px] overflow-y-auto prose prose-invert prose-sm leading-relaxed max-w-none text-muted-foreground select-none">
            {/* HTML rendered cleanly safely */}
            <div 
              dangerouslySetInnerHTML={{ __html: contract.content }} 
              className="space-y-4 text-sm font-sans"
            />
          </CardContent>
        </Card>
      </div>

      {/* Signature and identification panel */}
      <div className="lg:col-span-5">
        <Card className="bg-card border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              Signer le document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSign} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signerName" className="text-xs font-semibold">Nom complet du signataire *</Label>
                <Input
                  id="signerName"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Ex: Jean Dupont"
                  required
                  className="bg-background border-border"
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signerEmail" className="text-xs font-semibold">Adresse email de validation *</Label>
                <Input
                  id="signerEmail"
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="Ex: jean.dupont@client.com"
                  required
                  className="bg-background border-border"
                  disabled={pending}
                />
              </div>

              {/* Draw canvas zone */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Signature manuscrite (Dessinez au doigt ou à la souris) *</Label>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/40"
                    disabled={pending}
                    title="Effacer la signature"
                  >
                    <Eraser className="h-3 w-3" />
                    Effacer
                  </button>
                </div>

                {mounted && (
                  <div className="border border-border rounded-md bg-white overflow-hidden h-44 relative">
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      penColor="black"
                      canvasProps={{
                        className: "w-full h-full cursor-crosshair bg-white"
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Legal validation checkboxes */}
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="agreedToClauses"
                    checked={agreedToClauses}
                    onChange={(e) => setAgreedToClauses(e.target.checked)}
                    className="mt-0.5 rounded border-input text-primary focus:ring-primary h-4 w-4 bg-background shrink-0"
                    required
                  />
                  <Label htmlFor="agreedToClauses" className="text-xs leading-normal text-muted-foreground select-none">
                    Je déclare avoir lu, compris et entièrement validé l&apos;ensemble des clauses, conditions et engagements rédigés dans ce contrat.
                  </Label>
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="agreedToElectronicSign"
                    checked={agreedToElectronicSign}
                    onChange={(e) => setAgreedToElectronicSign(e.target.checked)}
                    className="mt-0.5 rounded border-input text-primary focus:ring-primary h-4 w-4 bg-background shrink-0"
                    required
                  />
                  <Label htmlFor="agreedToElectronicSign" className="text-xs leading-normal text-muted-foreground select-none font-semibold">
                    J&apos;accepte d&apos;apposer ma signature électronique sur ce document et reconnais sa pleine valeur juridique (article 1367 du Code civil).
                  </Label>
                </div>
              </div>

              {/* Submit button */}
              <Button type="submit" disabled={pending} className="w-full mt-3 bg-primary hover:bg-primary/95 text-primary-foreground font-bold py-2.5">
                {pending ? "Scellage cryptographique en cours…" : "Signer électroniquement"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
