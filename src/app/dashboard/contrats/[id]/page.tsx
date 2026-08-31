import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowLeft, CheckCircle2, FileDown, GitBranch, Info, Pencil, Plus, RefreshCw, ShieldCheck } from "lucide-react"
import { compileContractContent, getContractById } from "@/actions/contrats"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sanitizeContractHtml } from "@/lib/contracts/html"
import { assessContractQuality } from "@/lib/document-quality"
import { cn } from "@/lib/utils"
import { ContractStatusActions } from "../contract-status-actions"

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

const kindLabels: Record<string, string> = {
  STANDARD: "Contrat",
  AMENDMENT: "Avenant",
  MAINTENANCE_RENEWAL: "Renouvellement",
}

const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "À signer",
  SIGNED: "Signé",
  EXPIRED: "Expiré",
}

const renewalStatusLabels: Record<string, string> = {
  NOT_DUE: "non préparé",
  UPCOMING: "à préparer",
  PROPOSED: "proposé",
  ACCEPTED: "accepté",
  DECLINED: "refusé",
  RENEWED: "renouvelé",
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contract = await getContractById(id)
  if (!contract) notFound()

  let compiledContent = contract.content
  try {
    compiledContent = await compileContractContent(id)
  } catch (error) {
    console.error("Variable compilation failed, using raw contract content:", error)
  }
  const safeContractHtml = sanitizeContractHtml(compiledContent)
  const quality = assessContractQuality({
    title: contract.title,
    content: compiledContent,
    validFrom: contract.validFrom,
    validUntil: contract.validUntil,
    client: {
      name: contract.client.name,
      address: contract.client.address,
    },
    company: {
      name: contract.company.name,
      siret: contract.company.siret,
      address: contract.company.address,
    },
  })
  const visibleIssues = quality.issues.slice(0, 6)
  const issueIcon = {
    error: AlertTriangle,
    warning: AlertTriangle,
    info: Info,
  } as const

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/dashboard/contrats" aria-label="Retour aux contrats" className={buttonVariants({ variant: "ghost", size: "icon" })}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-all font-mono text-2xl font-bold tracking-tight">{contract.number}</h1>
              <Badge variant="outline">{kindLabels[contract.kind] || contract.kind}</Badge>
              <Badge variant="secondary">{statusLabels[contract.status] || contract.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {contract.title} —{" "}
              <Link href={`/dashboard/clients/${contract.clientId}`} className="hover:underline">
                {contract.client.name}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <a href={`/api/pdf/contrat/${contract.id}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
            <FileDown className="h-4 w-4" /> PDF
          </a>
          {contract.status !== "SIGNED" && contract.kind === "STANDARD" && (
            <Link href={`/dashboard/contrats/${contract.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil className="h-4 w-4" /> Éditer
            </Link>
          )}
          {contract.status === "SIGNED" && contract.kind !== "MAINTENANCE_RENEWAL" && (
            <Link href={`/dashboard/contrats/${contract.id}/amend`} className={buttonVariants({ variant: "outline" })}>
              <Plus className="h-4 w-4" /> Créer un avenant
            </Link>
          )}
          <ContractStatusActions contractId={contract.id} status={contract.status} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Qualité contractuelle
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{quality.score}</span>
              <span className="text-xs font-semibold text-muted-foreground">/100</span>
            </div>
            <div
              className={cn(
                "mt-3 inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                quality.status === "READY" && "border-success/30 bg-success/10 text-success",
                quality.status === "TO_REVIEW" && "border-warning/30 bg-warning/10 text-warning",
                quality.status === "BLOCKED" && "border-danger/30 bg-danger/10 text-danger",
              )}
            >
              {quality.label}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{quality.summary}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {visibleIssues.length > 0 ? (
              visibleIssues.map((issue) => {
                const Icon = issueIcon[issue.severity]
                return (
                  <div key={issue.id} className="flex gap-2 rounded-lg border border-border bg-background p-3">
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        issue.severity === "error" && "text-danger",
                        issue.severity === "warning" && "text-warning",
                        issue.severity === "info" && "text-muted-foreground",
                      )}
                    />
                    <div>
                      <p className="text-sm font-semibold">{issue.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issue.detail}</p>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success md:col-span-2">
                <CheckCircle2 className="h-4 w-4" />
                Aucun point bloquant détecté.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 text-sm md:grid-cols-2">
        {contract.validFrom && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">Valide à partir du</CardTitle>
            </CardHeader>
            <CardContent>{formatDate(contract.validFrom)}</CardContent>
          </Card>
        )}
        {contract.validUntil && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">Valide jusqu&apos;au</CardTitle>
            </CardHeader>
            <CardContent>{formatDate(contract.validUntil)}</CardContent>
          </Card>
        )}
      </div>

      {(contract.parentContract || contract.maintenanceContract || contract.changes.length > 0 || contract.amendments.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 text-primary" />
              Traçabilité contractuelle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {contract.parentContract && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold text-muted-foreground">Contrat source</p>
                <Link href={`/dashboard/contrats/${contract.parentContract.id}`} className="mt-1 inline-flex font-mono font-semibold text-primary hover:underline">
                  {contract.parentContract.number}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">{contract.parentContract.title}</p>
              </div>
            )}
            {contract.maintenanceContract && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Renouvellement d’entretien
                </p>
                <Link href="/dashboard/operations?tab=maintenance" className="mt-1 inline-flex font-mono font-semibold text-primary hover:underline">
                  {contract.maintenanceContract.number}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {contract.maintenanceContract.label} · décision {renewalStatusLabels[contract.maintenanceContract.renewalStatus] || contract.maintenanceContract.renewalStatus}
                </p>
              </div>
            )}
            {contract.changes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Modifications structurées</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {contract.changes.map((change) => (
                    <div key={change.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{change.label}</p>
                        <Badge variant="outline">{change.category}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Avant : {change.previousValue || "Non applicable"}</p>
                      <p className="mt-1 text-xs">Après : {change.nextValue}</p>
                      {change.financialImpactCents != null && <p className="mt-2 text-xs font-semibold tabular-nums">Impact : {formatMoney(change.financialImpactCents)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {contract.amendments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Avenants liés</p>
                <div className="space-y-2">
                  {contract.amendments.map((amendment) => (
                    <Link
                      key={amendment.id}
                      href={`/dashboard/contrats/${amendment.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30"
                    >
                      <span className="min-w-0">
                        <span className="font-mono text-xs font-semibold">{amendment.number}</span>
                        <span className="ml-2 text-sm">{amendment.title}</span>
                      </span>
                      <Badge variant="secondary">{statusLabels[amendment.status] || amendment.status}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contenu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: safeContractHtml }} />
        </CardContent>
      </Card>

      {contract.signatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Signatures ({contract.signatures.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {contract.signatures.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>
                    {s.signerName} <span className="text-muted-foreground">— {s.signerEmail}</span>
                  </span>
                  <span className="text-muted-foreground text-xs">{formatDate(s.signedAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
