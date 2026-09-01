import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Clock, FileText, Receipt } from "lucide-react"
import { getProjectById } from "@/actions/projets"
import { getRecordCrmProperties } from "@/actions/crm-properties"
import { RecordPropertiesPanel } from "@/components/crm/record-properties-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ProjectWorkspace } from "./project-workspace"

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, "0")}m`
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, crmProperties] = await Promise.all([
    getProjectById(id),
    getRecordCrmProperties("PROJECT", id),
  ])
  if (!project) notFound()

  const progress = project.budgetCents > 0
    ? Math.min(100, Math.round((project.consumedCents / project.budgetCents) * 100))
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/projets">
          <Button variant="ghost" size="icon" aria-label="Retour aux projets"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant="secondary">{project.status === "ACTIVE" ? "En cours" : project.status === "COMPLETED" ? "Terminé" : "Archivé"}</Badge>
            {project.projectTemplate ? <Badge variant="outline">{project.projectTemplate.name}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/dashboard/clients/${project.clientId}`} className="hover:underline">
              {project.client.name}
            </Link>
          </p>
        </div>
      </div>

      {project.description && (
        <Card><CardContent className="pt-6 text-sm">{project.description}</CardContent></Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Consommé : <span className="font-bold">{formatEuro(project.consumedCents)}</span></span>
            <span>Budget : <span className="font-bold">{formatEuro(project.budgetCents)}</span></span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {crmProperties ? <RecordPropertiesPanel objectType="PROJECT" recordId={project.id} data={crmProperties} /> : null}

      <ProjectWorkspace
        projectId={project.id}
        milestones={project.milestones.map((item) => ({ id: item.id, title: item.title, description: item.description, kind: item.kind, status: item.status, plannedStartAt: item.plannedStartAt?.toISOString() ?? null, dueDate: item.dueDate?.toISOString() ?? null, durationDays: item.durationDays, dependsOnId: item.dependsOnId, dependsOn: item.dependsOn, assignedMembershipId: item.assignedMembershipId, assignedMembership: item.assignedMembership }))}
        acceptanceItems={project.acceptanceItems.map((item) => ({ id: item.id, title: item.title, status: item.status, dueDate: item.dueDate?.toISOString() ?? null }))}
        files={project.files.map((file) => ({ id: file.id, name: file.name, size: file.size, type: file.type, createdAt: file.createdAt.toISOString() }))}
        profile={project.technicalProfile ? {
          surveyStatus: project.technicalProfile.surveyStatus as "DRAFT" | "SURVEYED" | "VALIDATED",
          surveyedAt: project.technicalProfile.surveyedAt?.toISOString() ?? null,
          surveyedBy: project.technicalProfile.surveyedBy,
          poolShape: project.technicalProfile.poolShape,
          poolLengthMm: project.technicalProfile.poolLengthMm,
          poolWidthMm: project.technicalProfile.poolWidthMm,
          poolDepthMm: project.technicalProfile.poolDepthMm,
          diagonal1Mm: project.technicalProfile.diagonal1Mm,
          diagonal2Mm: project.technicalProfile.diagonal2Mm,
          copingType: project.technicalProfile.copingType,
          deckMaterial: project.technicalProfile.deckMaterial,
          accessWidthMm: project.technicalProfile.accessWidthMm,
          powerSupply: project.technicalProfile.powerSupply,
          obstacles: project.technicalProfile.obstacles,
          installationConstraints: project.technicalProfile.installationConstraints,
          recommendedProduct: project.technicalProfile.recommendedProduct,
          coverModel: project.technicalProfile.coverModel,
          coverColor: project.technicalProfile.coverColor,
          measurementNotes: project.technicalProfile.measurementNotes,
          validationNotes: project.technicalProfile.validationNotes,
          validatedAt: project.technicalProfile.validatedAt?.toISOString() ?? null,
        } : null}
        members={project.planningMembers.map((member) => ({ id: member.id, user: member.user }))}
      />

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Temps passé ({project.timeEntries.length})</CardTitle></CardHeader>
        <CardContent>
          {project.timeEntries.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Aucune entrée de temps pour ce projet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Durée</TableHead></TableRow></TableHeader>
              <TableBody>
                {project.timeEntries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{formatDate(e.date)}</TableCell>
                    <TableCell>{e.description ?? "—"}</TableCell>
                    <TableCell className="font-mono">{formatDuration(e.durationSec)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Devis ({project.quotes.length})</CardTitle></CardHeader>
          <CardContent>
            {project.quotes.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Aucun devis relié à ce projet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {project.quotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/dashboard/devis/${q.id}`} className="hover:underline font-mono text-xs">
                      {q.number}
                    </Link> — {q.object}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" /> Factures ({project.invoices.length})</CardTitle></CardHeader>
          <CardContent>
            {project.invoices.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Aucune facture reliée à ce projet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {project.invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/dashboard/factures/${inv.id}`} className="hover:underline font-mono text-xs">
                      {inv.number}
                    </Link> — {formatEuro(inv.totalTtcCents)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
