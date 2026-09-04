"use client"

import { useRef, useState, useTransition } from "react"
import { Archive, CheckCircle2, Database, FileArchive, FlaskConical, Import, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, Upload, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"

import {
  analyzeMigrationRun,
  createManualImportRun,
  discoverSourceConnection,
  importMigrationRun,
  refreshHubSpotSnapshot,
  saveSourceConnection,
  simulateMigrationRun,
  startHubSpotSnapshot,
  testSourceConnection,
  verifyMigrationRun,
} from "@/actions/migrations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type MigrationData = Awaited<ReturnType<typeof import("@/actions/migrations").getMigrationDashboard>>
type Provider = "HUBSPOT" | "EXTRABAT"

type DirectUpload = {
  uploadUrl: string
  storageKey: string
  fileName: string
  headers: Record<string, string>
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "À configurer",
  ACTIVE: "Connecté",
  ERROR: "Erreur",
  RUNNING: "En cours",
  PROCESSING: "Préparation",
  COMPLETE: "Terminé",
  PARTIAL: "Partiel",
  FAILED: "Échec",
  READY: "Prêt à analyser",
  ANALYZING: "Analyse",
  ANALYZED: "Analysé",
  SIMULATED: "Simulation validée",
  IMPORTING: "Import",
  IMPORTED: "Importé",
  VERIFIED: "Vérifié",
  VERIFICATION_FAILED: "Contrôle en échec",
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function MigrationCenter({ initialData }: { initialData: MigrationData }) {
  const router = useRouter()
  const archiveInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [provider, setProvider] = useState<Provider>("HUBSPOT")
  const [name, setName] = useState("HubSpot")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://myextrabat.com")
  const [testPath, setTestPath] = useState("/")
  const [archiveProvider, setArchiveProvider] = useState<Provider>("EXTRABAT")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const verifiedRuns = initialData.runs.filter((run) => run.status === "VERIFIED").length
  const migrationSteps: Array<{ label: string; detail: string; ready: boolean; icon: LucideIcon }> = [
    { label: "1. Connecter", detail: "Clé chiffrée ou exports déposés", ready: initialData.connections.length > 0 || initialData.runs.some((run) => run.documents > 0), icon: KeyRound },
    { label: "2. Inventorier", detail: "Schéma et archives analysés", ready: initialData.runs.some((run) => ["ANALYZED", "SIMULATED", "IMPORTED", "VERIFIED"].includes(run.status)), icon: Search },
    { label: "3. Simuler", detail: "Doublons et rejets contrôlés", ready: initialData.runs.some((run) => ["SIMULATED", "IMPORTED", "VERIFIED"].includes(run.status)), icon: FlaskConical },
    { label: "4. Vérifier", detail: verifiedRuns ? `${verifiedRuns} lot${verifiedRuns > 1 ? "s" : ""} rapproché${verifiedRuns > 1 ? "s" : ""}` : "Import et rapport d’intégrité", ready: verifiedRuns > 0, icon: ShieldCheck },
  ]

  function saveConnection() {
    startTransition(async () => {
      const result = await saveSourceConnection({ provider, name, apiKey, baseUrl, testPath, authHeader: "Authorization", authScheme: "Bearer" })
      if (!result?.success) {
        toast.error(result?.error ?? "Enregistrement impossible.")
        return
      }
      setApiKey("")
      toast.success("Connexion enregistrée et chiffrée.")
      router.refresh()
    })
  }

  function execute(label: string, operation: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await operation()
        toast.success(label)
        router.refresh()
      } catch (error) {
        toast.error(getErrorMessage(error, "Opération impossible."))
      }
    })
  }

  async function uploadArchive(files: FileList | null) {
    if (!files?.length) return
    let runId: string | null = null
    setUploading(true)
    try {
      const selected = Array.from(files)
      if (selected.length > 30) throw new Error("Maximum 30 fichiers par lot.")
      if (selected.some((file) => file.size > 250 * 1024 * 1024) || selected.reduce((total, file) => total + file.size, 0) > 500 * 1024 * 1024) {
        throw new Error("Maximum 250 Mo par fichier et 500 Mo par lot.")
      }

      const run = await createManualImportRun(archiveProvider)
      if (!run?.success) throw new Error("Création du lot impossible")
      runId = run.runId
      const descriptors: Array<{ name: string; size: number; type: string; sha256: string }> = []
      for (const [index, file] of selected.entries()) {
        setUploadProgress(`Empreinte ${index + 1}/${selected.length}`)
        descriptors.push({ name: file.name, size: file.size, type: file.type || "application/octet-stream", sha256: await fileSha256(file) })
      }

      const presignResponse = await fetch(`/api/migrations/${runId}/artifacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "presign", files: descriptors }),
      })
      const presigned = (await presignResponse.json()) as { error?: string; code?: string; uploads?: DirectUpload[] }
      if (presigned.code === "DIRECT_UPLOAD_UNAVAILABLE") {
        if (selected.reduce((total, file) => total + file.size, 0) > 3.5 * 1024 * 1024) {
          throw new Error("Configurez R2 pour transférer plus de 3,5 Mo depuis l’environnement local.")
        }
        setUploadProgress("Archivage local")
        const legacyBody = new FormData()
        for (const file of selected) legacyBody.append("artifacts", file)
        const legacyResponse = await fetch(`/api/migrations/${runId}/artifacts`, { method: "POST", body: legacyBody })
        const legacyResult = await legacyResponse.json()
        if (!legacyResponse.ok) throw new Error(legacyResult?.error ?? "Archivage local impossible")
        toast.success(`${legacyResult.files.length} fichier${legacyResult.files.length > 1 ? "s" : ""} archivé${legacyResult.files.length > 1 ? "s" : ""}.`)
        router.refresh()
        return
      }
      if (!presignResponse.ok || presigned.uploads?.length !== selected.length) throw new Error(presigned.error ?? "Préparation du transfert impossible")

      for (const [index, upload] of presigned.uploads.entries()) {
        setUploadProgress(`Transfert ${index + 1}/${selected.length}`)
        const response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: selected[index] })
        if (!response.ok) throw new Error(`Le transfert de ${selected[index].name} a été refusé (${response.status}).`)
      }

      setUploadProgress("Vérification serveur")
      const completeResponse = await fetch(`/api/migrations/${runId}/artifacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          files: descriptors.map((file, index) => ({ ...file, storageKey: presigned.uploads![index].storageKey })),
        }),
      })
      const result = await completeResponse.json()
      if (!completeResponse.ok) throw new Error(result?.error ?? "Confirmation de l’archivage impossible")
      toast.success(`${result.files.length} fichier${result.files.length > 1 ? "s" : ""} archivé${result.files.length > 1 ? "s" : ""}.`)
      router.refresh()
    } catch (error) {
      if (runId) {
        await fetch(`/api/migrations/${runId}/artifacts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "abort" }),
        }).catch(() => {})
      }
      toast.error(getErrorMessage(error, "Archivage impossible."))
    } finally {
      setUploading(false)
      setUploadProgress("")
      if (archiveInputRef.current) archiveInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-sm font-semibold">Parcours de reprise sécurisé</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Chaque lot reste réversible et traçable. Aucune donnée n’est écrite avant la simulation.</p></div>
          <Badge variant={verifiedRuns ? "default" : "secondary"}>{migrationSteps.filter((step) => step.ready).length}/4 étapes franchies</Badge>
        </div>
        <ol className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          {migrationSteps.map((step) => <li key={step.label} className="flex min-h-20 items-center gap-3 bg-card px-4 py-3"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${step.ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{step.ready ? <CheckCircle2 className="size-4" /> : <step.icon className="size-4" />}</span><span className="min-w-0"><span className="block text-sm font-semibold">{step.label}</span><span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{step.detail}</span></span></li>)}
        </ol>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-primary" />
              Connecter une source
            </CardTitle>
            <CardDescription>Le client renseigne lui-même son accès. La clé est chiffrée côté serveur et n’est jamais réaffichée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={provider}
                  onValueChange={(value) => {
                    const next = value as Provider
                    setProvider(next)
                    setName(next === "HUBSPOT" ? "HubSpot" : "Extrabat")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HUBSPOT">HubSpot</SelectItem>
                    <SelectItem value="EXTRABAT">Extrabat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="connection-name">Nom interne</Label>
                <Input id="connection-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-key">{provider === "HUBSPOT" ? "Jeton d'application privée" : "Clé User API"}</Label>
              <Input
                id="source-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Saisir la clé sans la partager ailleurs"
              />
            </div>
            {provider === "EXTRABAT" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-2">
                  <Label htmlFor="extrabat-url">Adresse API fournie par Extrabat</Label>
                  <Input id="extrabat-url" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extrabat-test">Route de test</Label>
                  <Input id="extrabat-test" value={testPath} onChange={(event) => setTestPath(event.target.value)} />
                </div>
              </div>
            ) : null}
            <Button onClick={saveConnection} disabled={isPending || !apiKey.trim() || !name.trim()}>
              {isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Enregistrer
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileArchive className="size-4 text-primary" />
              Déposer des exports
            </CardTitle>
            <CardDescription>Solution de repli pour les objets absents de l’API ou lorsque le compte source ne permet pas une connexion directe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Origine de l'archive</Label>
              <Select value={archiveProvider} onValueChange={(value) => setArchiveProvider(value as Provider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXTRABAT">Extrabat</SelectItem>
                  <SelectItem value="HUBSPOT">HubSpot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input
              ref={archiveInputRef}
              className="hidden"
              type="file"
              multiple
              accept=".csv,.json,.xlsx,.xls,.zip,.pdf"
              onChange={(event) => void uploadArchive(event.target.files)}
            />
            <Button variant="outline" onClick={() => archiveInputRef.current?.click()} disabled={isPending || uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {uploading ? uploadProgress : "Choisir les fichiers"}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              CSV, JSON, Excel, ZIP et PDF · 250 Mo par fichier, 500 Mo par lot. Envoi direct chiffré vers le stockage, contrôle de taille à la réception, puis empreinte recalculée avant analyse.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Connexions configurées</h2>
          <p className="mt-1 text-xs text-muted-foreground">Testez les droits avant de lancer un instantané.</p>
        </div>
        {initialData.connections.length ? (
          <div className="divide-y divide-border">
            {initialData.connections.map((connection) => (
              <div key={connection.id} className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Database className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{connection.name}</p>
                    <Badge variant={connection.status === "ACTIVE" ? "secondary" : connection.status === "ERROR" ? "destructive" : "outline"}>
                      {STATUS_LABELS[connection.status] ?? connection.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {connection.provider}
                    {connection.lastError ? ` · ${connection.lastError}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      execute("Connexion vérifiée.", async () => {
                        const result = await testSourceConnection(connection.id)
                        if (!result?.success) throw new Error(result?.error)
                      })
                    }
                  >
                    <CheckCircle2 />
                    Tester
                  </Button>
                  {connection.provider === "HUBSPOT" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          execute("Schéma HubSpot inventorié.", async () => {
                            const result = await discoverSourceConnection(connection.id)
                            if (!result?.success) throw new Error(result?.error)
                          })
                        }
                      >
                        <Search />
                        Analyser
                      </Button>
                      <Button
                        size="sm"
                        disabled={isPending || connection.status !== "ACTIVE"}
                        onClick={() =>
                          execute("Exports HubSpot démarrés.", async () => {
                            const result = await startHubSpotSnapshot(connection.id)
                            if (!result?.success) throw new Error("Aucun export n'a pu démarrer")
                          })
                        }
                      >
                        <Archive />
                        Instantané complet
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Aucune connexion enregistrée.</div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Lots de reprise</h2>
        </div>
        {initialData.runs.length ? (
          <div className="divide-y divide-border">
            {initialData.runs.map((run) => (
              <div key={run.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/migrations/${run.id}`} className="font-mono text-xs font-semibold underline-offset-4 hover:underline">
                      {run.id}
                    </Link>
                    <Badge
                      variant={
                        ["COMPLETE", "ANALYZED", "SIMULATED", "IMPORTED", "VERIFIED"].includes(run.status)
                          ? "secondary"
                          : ["FAILED", "VERIFICATION_FAILED"].includes(run.status)
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {STATUS_LABELS[run.status] ?? run.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.provider} · {run.kind} · {run.documents} archive{run.documents > 1 ? "s" : ""} · {run.records} ligne{run.records > 1 ? "s" : ""} · {run.openIssues}{" "}
                    anomalie{run.openIssues > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {run.provider === "HUBSPOT" && run.kind === "FULL_SNAPSHOT" && run.status === "PROCESSING" ? (
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("État des exports actualisé.", () => refreshHubSpotSnapshot(run.id))}>
                      <RefreshCw />
                      Actualiser
                    </Button>
                  ) : null}
                  {run.documents > 0 && ["READY", "COMPLETE", "PARTIAL", "ANALYZED"].includes(run.status) ? (
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("Archives analysées et indexées.", () => analyzeMigrationRun(run.id))}>
                      <Search />
                      Analyser les archives
                    </Button>
                  ) : null}
                  {run.status === "ANALYZED" ? (
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("Simulation validée.", () => simulateMigrationRun(run.id))}>
                      <FlaskConical />
                      Simuler
                    </Button>
                  ) : null}
                  {run.status === "SIMULATED" ? (
                    <Button size="sm" disabled={isPending} onClick={() => execute("Données importées avec leurs identifiants source.", () => importMigrationRun(run.id))}>
                      <Import />
                      Importer
                    </Button>
                  ) : null}
                  {["IMPORTED", "VERIFICATION_FAILED"].includes(run.status) || (run.status === "PARTIAL" && run.metrics.some((metric) => metric.imported + metric.rejected > 0)) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        execute("Rapprochement et intégrité des archives vérifiés.", async () => {
                          const result = await verifyMigrationRun(run.id)
                          if (!result?.success) throw new Error("Le contrôle a détecté des écarts. Consultez le rapport du lot.")
                        })
                      }
                    >
                      <ShieldCheck />
                      Vérifier
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Aucun lot de reprise lancé.</div>
        )}
      </section>
    </div>
  )
}
