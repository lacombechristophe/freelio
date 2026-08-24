"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useDropzone } from "react-dropzone"
import { UploadCloud, FileText, Sparkles, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { createExpense, updateExpense } from "@/actions/depenses"
import { processExpenseOcr } from "@/actions/depenses/ocr"
import { cn } from "@/lib/utils"

type Expense = {
  id: string
  label: string
  provider?: string | null
  amountCents: number
  tvaCents: number
  date: Date | string
  category: string
  projectId?: string | null
  clientId?: string | null
}

const CATEGORIES = ["Fournitures", "Matériel", "Sous-traitance", "Déplacement", "Repas", "Logiciel", "Formation", "Autre"]

export function ExpenseFormDialog({
  expense,
  open,
  onOpenChange,
  projects,
}: {
  expense?: Expense
  open: boolean
  onOpenChange: (o: boolean) => void
  projects: Array<{ id: string; name: string; clientId: string }>
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [ocrLoading, setOcrLoading] = React.useState(false)
  const [fileAttached, setFileAttached] = React.useState<string | null>(null)
  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(null)
  
  const [form, setForm] = React.useState({
    label: expense?.label ?? "",
    provider: expense?.provider ?? "",
    amount: expense ? (expense.amountCents / 100).toString() : "",
    tva: expense ? (expense.tvaCents / 100).toString() : "0",
    date: expense
      ? new Date(expense.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    category: expense?.category ?? "Fournitures",
    projectId: expense?.projectId ?? "",
  })

  React.useEffect(() => {
    if (open) {
      if (expense) {
        setForm({
          label: expense.label,
          provider: expense.provider ?? "",
          amount: (expense.amountCents / 100).toString(),
          tva: (expense.tvaCents / 100).toString(),
          date: new Date(expense.date).toISOString().slice(0, 10),
          category: expense.category,
          projectId: expense.projectId ?? "",
        })
      } else {
        setForm({
          label: "",
          provider: "",
          amount: "",
          tva: "0",
          date: new Date().toISOString().slice(0, 10),
          category: "Fournitures",
          projectId: "",
        })
        setFileAttached(null)
        setAttachmentFile(null)
      }
    }
  }, [open, expense])

  // Conversion of file to Base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1]
        resolve(base64String)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  // Handle file drop
  const onDrop = React.useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setOcrLoading(true)
    setFileAttached(file.name)
    setAttachmentFile(file)
    const toastId = toast.loading("Analyse intelligente du reçu par Gemini Vision…")

    try {
      const base64 = await fileToBase64(file)
      const mimeType = file.type

      const result = await processExpenseOcr(base64, mimeType)

      if (result) {
        setForm((current) => ({
          label: result.label,
          provider: result.provider,
          amount: (result.amountCents / 100).toString(),
          tva: (result.tvaCents / 100).toString(),
          date: result.date,
          category: result.category,
          projectId: current.projectId,
        }))

        toast.success("Champs préremplis par OCR. Vérifiez les montants et la TVA avant d’enregistrer.", { id: toastId })
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Échec de la lecture intelligente. Remplissage manuel nécessaire.", { id: toastId })
    } finally {
      setOcrLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".png", ".jpg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    disabled: ocrLoading || pending,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const payload = {
        label: form.label,
        provider: form.provider,
        amountCents: Math.round(Number(form.amount || 0) * 100),
        tvaCents: Math.round(Number(form.tva || 0) * 100),
        date: form.date,
        category: form.category,
        projectId: form.projectId,
        clientId: projects.find((project) => project.id === form.projectId)?.clientId ?? "",
      }
      if (expense) {
        await updateExpense(expense.id, payload)
        toast.success("Dépense mise à jour.")
      } else {
        const created = await createExpense(payload)
        if (attachmentFile) {
          const upload = new FormData()
          upload.set("file", attachmentFile)
          const response = await fetch(`/api/files/expense/${created.id}`, {
            method: "POST",
            body: upload,
          })
          if (!response.ok) {
            const result = await response.json().catch(() => null)
            toast.warning(result?.error ?? "Dépense créée, mais le justificatif n'a pas pu être enregistré.")
          }
        }
        toast.success("Dépense créée.")
      }
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-popover border text-popover-foreground">
        <DialogHeader>
          <DialogTitle>{expense ? "Éditer la dépense" : "Enregistrer une dépense"}</DialogTitle>
        </DialogHeader>

        {/* Drag and Drop Zone for OCR receipts (Only when creating a new expense) */}
        {!expense && (
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center transition-colors cursor-pointer",
              isDragActive ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent/25",
              ocrLoading && "pointer-events-none opacity-60 bg-muted/20 border-muted"
            )}
          >
            <input {...getInputProps()} />
            {ocrLoading ? (
              <div className="flex flex-col items-center space-y-2 py-2">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <span className="text-xs font-bold text-primary flex items-center gap-1.5 animate-pulse">
                  <Sparkles className="h-3.5 w-3.5" />
                  Gemini AI lit votre reçu…
                </span>
              </div>
            ) : fileAttached ? (
              <div className="flex flex-col items-center space-y-1.5 py-1">
                <FileText className="h-7 w-7 text-success" />
                <span className="text-xs font-semibold text-foreground text-center line-clamp-1">{fileAttached}</span>
                <span className="text-xs text-muted-foreground">Cliquez ou glissez pour remplacer</span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-1.5 py-1 text-center">
                <UploadCloud className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-xs font-semibold text-foreground">Scannez votre justificatif avec l'IA</span>
                <span className="text-xs text-muted-foreground">Glissez-déposez un ticket PDF ou Image</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="label" className="text-xs font-semibold">Libellé *</Label>
            <Input
              id="label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ex : Fournitures pour chantier Martin"
              required
              className="bg-background border-border"
              disabled={ocrLoading || pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider" className="text-xs font-semibold">Fournisseur</Label>
            <Input
              id="provider"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="Ex : Fournisseur couverture"
              className="bg-background border-border"
              disabled={ocrLoading || pending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs font-semibold">Montant TTC (€) *</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                className="bg-background border-border"
                disabled={ocrLoading || pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tva" className="text-xs font-semibold">TVA (€)</Label>
              <Input
                id="tva"
                type="number"
                min="0"
                step="0.01"
                value={form.tva}
                onChange={(e) => setForm({ ...form, tva: e.target.value })}
                className="bg-background border-border"
                disabled={ocrLoading || pending}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-xs font-semibold">Date *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                className="bg-background border-border text-xs"
                disabled={ocrLoading || pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Catégorie *</Label>
              <Select 
                value={form.category} 
                onValueChange={(v) => setForm({ ...form, category: v ?? "Fournitures" })}
                disabled={ocrLoading || pending}
              >
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Projet lié</Label>
            <Select
              value={form.projectId || "none"}
              onValueChange={(value) => setForm({ ...form, projectId: value === "none" ? "" : value ?? "" })}
              disabled={ocrLoading || pending}
            >
              <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun projet</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={ocrLoading || pending} />}>Annuler</DialogClose>
            <Button type="submit" disabled={ocrLoading || pending}>
              {pending ? "Enregistrement…" : expense ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
