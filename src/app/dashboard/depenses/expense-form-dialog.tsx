"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { uploadResourceFile } from "@/lib/client-file-upload"
import { useDropzone } from "react-dropzone"
import { UploadCloud, FileText } from "lucide-react"
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
import { createExpense, getExpenseProjectChoices, updateExpense } from "@/actions/depenses"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
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
type ProjectChoices = Awaited<ReturnType<typeof getExpenseProjectChoices>>

export function ExpenseFormDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense?: Expense
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [fileAttached, setFileAttached] = React.useState<string | null>(null)
  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(null)
  const [projectSearch, setProjectSearch] = React.useState("")
  const [projectPage, setProjectPage] = React.useState(1)
  const [projectRevision, setProjectRevision] = React.useState(0)
  const [loadingProjects, startProjectTransition] = React.useTransition()
  const [choices, setChoices] = React.useState<{ key: string; data: ProjectChoices | null; error: boolean } | null>(null)
  
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
      setProjectSearch("")
      setProjectPage(1)
      setProjectRevision(value => value + 1)
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

  const projectKey = JSON.stringify([form.projectId, projectSearch, projectPage, projectRevision])
  const freshProjects = choices?.key === projectKey
  React.useEffect(() => {
    if (!open || freshProjects) return
    let current = true
    const timer = setTimeout(() => startProjectTransition(async () => {
      try {
        const data = await getExpenseProjectChoices({ selectedId: form.projectId || undefined, search: projectSearch, page: projectPage })
        if (form.projectId && !data.selected) throw new Error("Chantier indisponible")
        if (current) {
          setProjectPage(data.page)
          setChoices({ key: JSON.stringify([form.projectId, projectSearch, data.page, projectRevision]), data, error: false })
        }
      } catch {
        if (current) setChoices(previous => ({ key: projectKey, data: previous?.data ?? null, error: true }))
      }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [open, freshProjects, projectKey, form.projectId, projectSearch, projectPage, projectRevision])
  const projectsBusy = loadingProjects || !freshProjects
  const projectsError = freshProjects && Boolean(choices?.error)
  const selectedProject = choices?.data?.selected?.id === form.projectId ? choices.data.selected : choices?.data?.items.find(item => item.id === form.projectId)
  const projectOptions = freshProjects && !projectsError ? choices?.data?.items ?? [] : []
  const projects = selectedProject && !projectOptions.some(item => item.id === selectedProject.id) ? [selectedProject, ...projectOptions] : projectOptions
  const canSave = !pending && !projectsBusy && !projectsError && (!form.projectId || Boolean(selectedProject))

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setFileAttached(file.name)
    setAttachmentFile(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".png", ".jpg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    disabled: pending,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
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
        clientId: selectedProject?.clientId ?? (form.projectId || expense?.projectId ? "" : expense?.clientId ?? ""),
      }
      if (expense) {
        await updateExpense(expense.id, payload)
        toast.success("Dépense mise à jour.")
      } else {
        const created = await createExpense(payload)
        if (attachmentFile) {
          await uploadResourceFile("expense", created.id, attachmentFile).catch((error) => {
            toast.warning(error instanceof Error ? error.message : "Dépense créée, mais le justificatif n'a pas pu être enregistré.")
          })
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

        {/* Receipt attachment when creating a new expense. */}
        {!expense && (
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center transition-colors cursor-pointer",
              isDragActive ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent/25"
            )}
          >
            <input {...getInputProps()} />
            {fileAttached ? (
              <div className="flex flex-col items-center space-y-1.5 py-1">
                <FileText className="h-7 w-7 text-success" />
                <span className="text-xs font-semibold text-foreground text-center line-clamp-1">{fileAttached}</span>
                <span className="text-xs text-muted-foreground">Cliquez ou glissez pour remplacer</span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-1.5 py-1 text-center">
                <UploadCloud className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-xs font-semibold text-foreground">Joignez votre justificatif</span>
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
              disabled={pending}
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
              disabled={pending}
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
                disabled={pending}
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
                disabled={pending}
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
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-category" className="text-xs font-semibold">Catégorie *</Label>
              <Select 
                value={form.category} 
                onValueChange={(v) => setForm({ ...form, category: v ?? "Fournitures" })}
                disabled={pending}
              >
                <SelectTrigger id="expense-category" className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-project" className="text-xs font-semibold">Projet lié</Label>
            <Input aria-label="Rechercher un chantier" placeholder="Rechercher un chantier…" value={projectSearch} maxLength={200} disabled={pending} onChange={event => { setProjectSearch(event.target.value); setProjectPage(1) }} />
            <Select
              value={form.projectId || "none"}
              onValueChange={(value) => setForm({ ...form, projectId: value === "none" ? "" : value ?? "" })}
              disabled={pending}
            >
              <SelectTrigger id="expense-project" className="w-full bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun projet</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <DirectoryPagination total={choices?.data?.total ?? 0} page={freshProjects ? choices?.data?.page ?? projectPage : projectPage} pending={projectsBusy} error={projectsError} onPage={setProjectPage} onRetry={() => setProjectRevision(value => value + 1)} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Annuler</DialogClose>
            <Button type="submit" disabled={!canSave}>
              {pending ? "Enregistrement…" : expense ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
