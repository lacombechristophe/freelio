"use client"

import { useRef, useState, useTransition } from "react"
import { Archive, CheckCircle2, Database, FileArchive, FlaskConical, Import, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react"
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
} from "@/actions/migrations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type MigrationData = Awaited<ReturnType<typeof import("@/actions/migrations").getMigrationDashboard>>
type Provider = "HUBSPOT" | "EXTRABAT"

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
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function MigrationCenter({ initialData }: { initialData: MigrationData }) {
  const router = useRouter()
  const archiveInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [provider, setProvider] = useState<Provider>("HUBSPOT")
  const [name, setName] = useState("HubSpot Diskoov")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://myextrabat.com")
  const [testPath, setTestPath] = useState("/")
  const [archiveProvider, setArchiveProvider] = useState<Provider>("EXTRABAT")

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
    try {
      const run = await createManualImportRun(archiveProvider)
      if (!run?.success) throw new Error("Création du lot impossible")
      const formData = new FormData()
      Array.from(files).forEach((file) => formData.append("artifacts", file))
      const response = await fetch(`/api/migrations/${run.runId}/artifacts`, { method: "POST", body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error ?? "Archivage impossible")
      toast.success(`${result.files.length} fichier${result.files.length > 1 ? "s" : ""} archivé${result.files.length > 1 ? "s" : ""}.`)
      router.refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, "Archivage impossible."))
    } finally {
      if (archiveInputRef.current) archiveInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-primary" />Connecter une source</CardTitle>
            <CardDescription>La clé est chiffrée côté serveur et n'est jamais réaffichée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={provider} onValueChange={(value) => {
                  const next = value as Provider
                  setProvider(next)
                  setName(next === "HUBSPOT" ? "HubSpot Diskoov" : "Extrabat Diskoov")
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="HUBSPOT">HubSpot</SelectItem><SelectItem value="EXTRABAT">Extrabat</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="connection-name">Nom interne</Label>
                <Input id="connection-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-key">{provider === "HUBSPOT" ? "Jeton d'application privée" : "Clé User API"}</Label>
              <Input id="source-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Saisir la clé sans la partager ailleurs" />
            </div>
            {provider === "EXTRABAT" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-2"><Label htmlFor="extrabat-url">Adresse API fournie par Extrabat</Label><Input id="extrabat-url" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="extrabat-test">Route de test</Label><Input id="extrabat-test" value={testPath} onChange={(event) => setTestPath(event.target.value)} /></div>
              </div>
            ) : null}
            <Button onClick={saveConnection} disabled={isPending || !apiKey.trim() || !name.trim()}>
              {isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Enregistrer
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileArchive className="size-4 text-primary" />Déposer des exports</CardTitle>
            <CardDescription>Solution de repli officielle pour les modules non couverts par API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Origine de l'archive</Label>
              <Select value={archiveProvider} onValueChange={(value) => setArchiveProvider(value as Provider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="EXTRABAT">Extrabat</SelectItem><SelectItem value="HUBSPOT">HubSpot</SelectItem></SelectContent>
              </Select>
            </div>
            <input ref={archiveInputRef} className="hidden" type="file" multiple accept=".csv,.json,.xlsx,.xls,.zip,.pdf" onChange={(event) => void uploadArchive(event.target.files)} />
            <Button variant="outline" onClick={() => archiveInputRef.current?.click()} disabled={isPending}><Upload />Choisir les fichiers</Button>
            <p className="text-xs leading-5 text-muted-foreground">CSV, JSON, Excel, ZIP et PDF. Empreinte SHA-256 calculée à la réception.</p>
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
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Database className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{connection.name}</p><Badge variant={connection.status === "ACTIVE" ? "secondary" : connection.status === "ERROR" ? "destructive" : "outline"}>{STATUS_LABELS[connection.status] ?? connection.status}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{connection.provider}{connection.lastError ? ` · ${connection.lastError}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("Connexion vérifiée.", async () => {
                    const result = await testSourceConnection(connection.id)
                    if (!result?.success) throw new Error(result?.error)
                  })}><CheckCircle2 />Tester</Button>
                  {connection.provider === "HUBSPOT" ? <>
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("Schéma HubSpot inventorié.", async () => {
                      const result = await discoverSourceConnection(connection.id)
                      if (!result?.success) throw new Error(result?.error)
                    })}><Search />Analyser</Button>
                    <Button size="sm" disabled={isPending || connection.status !== "ACTIVE"} onClick={() => execute("Exports HubSpot démarrés.", async () => {
                      const result = await startHubSpotSnapshot(connection.id)
                      if (!result?.success) throw new Error("Aucun export n'a pu démarrer")
                    })}><Archive />Instantané complet</Button>
                  </> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">Aucune connexion enregistrée.</div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Lots de reprise</h2></div>
        {initialData.runs.length ? (
          <div className="divide-y divide-border">
            {initialData.runs.map((run) => (
              <div key={run.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/dashboard/migrations/${run.id}`} className="font-mono text-xs font-semibold underline-offset-4 hover:underline">{run.id}</Link><Badge variant={["COMPLETE", "ANALYZED", "SIMULATED", "IMPORTED"].includes(run.status) ? "secondary" : run.status === "FAILED" ? "destructive" : "outline"}>{STATUS_LABELS[run.status] ?? run.status}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{run.provider} · {run.kind} · {run.documents} archive{run.documents > 1 ? "s" : ""} · {run.records} ligne{run.records > 1 ? "s" : ""} · {run.openIssues} anomalie{run.openIssues > 1 ? "s" : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {run.provider === "HUBSPOT" && run.kind === "FULL_SNAPSHOT" && run.status === "PROCESSING" ? (
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("État des exports actualisé.", () => refreshHubSpotSnapshot(run.id))}><RefreshCw />Actualiser</Button>
                  ) : null}
                  {run.documents > 0 && ["READY", "COMPLETE", "PARTIAL", "ANALYZED"].includes(run.status) ? (
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("Archives analysées et indexées.", () => analyzeMigrationRun(run.id))}><Search />Analyser les archives</Button>
                  ) : null}
                  {run.status === "ANALYZED" ? (
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => execute("Simulation validée.", () => simulateMigrationRun(run.id))}><FlaskConical />Simuler</Button>
                  ) : null}
                  {run.status === "SIMULATED" ? (
                    <Button size="sm" disabled={isPending} onClick={() => execute("Données importées avec leurs identifiants source.", () => importMigrationRun(run.id))}><Import />Importer</Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">Aucun lot de reprise lancé.</div>}
      </section>
    </div>
  )
}
