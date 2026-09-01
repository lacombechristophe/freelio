import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, MapPin } from "lucide-react"
import { getClientById } from "@/actions/clients"
import { getRecordCrmProperties } from "@/actions/crm-properties"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ClientWorkspace } from "./client-workspace"
import { ClientPortalPanel } from "./client-portal-panel"
import { RecordPropertiesPanel } from "@/components/crm/record-properties-panel"

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [client, crmProperties] = await Promise.all([
    getClientById(id),
    getRecordCrmProperties("CLIENT", id),
  ])

  if (!client) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/clients">
          <Button variant="ghost" size="icon" aria-label="Retour aux clients">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
            <Badge variant="secondary" className="text-xs uppercase">
              <Building2 className="h-3 w-3 mr-1" />
              {client.type}
            </Badge>
          </div>
          {client.address && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" /> {client.address}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">CA Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatEuro(client.totalRevenueCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Impayé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-danger">{formatEuro(client.totalUnpaidCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Score relation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{client.relationScore}%</p>
            <Link href="/dashboard/service/customer-success" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Voir dans le portefeuille</Link>
          </CardContent>
        </Card>
      </div>

      {crmProperties ? <RecordPropertiesPanel objectType="CLIENT" recordId={client.id} data={crmProperties} /> : null}

      <ClientWorkspace
        clientId={client.id}
        nextActionLabel={client.nextActionLabel}
        nextActionAt={client.nextActionAt?.toISOString() ?? null}
        contacts={client.contacts.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          role: contact.role,
          isPrimary: contact.isPrimary,
        }))}
        activities={client.activities.map((activity) => ({
          id: activity.id,
          type: activity.type,
          content: activity.content,
          happenedAt: activity.happenedAt.toISOString(),
        }))}
        files={client.files.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          createdAt: file.createdAt.toISOString(),
        }))}
      />

      <ClientPortalPanel
        clientId={client.id}
        contacts={client.contacts.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
        }))}
        accesses={client.portalAccesses.map((access) => ({
          ...access,
          expiresAt: access.expiresAt.toISOString(),
          lastUsedAt: access.lastUsedAt?.toISOString() ?? null,
          revokedAt: access.revokedAt?.toISOString() ?? null,
          createdAt: access.createdAt.toISOString(),
        }))}
        messages={client.portalMessages.map((message) => ({
          ...message,
          readAt: message.readAt?.toISOString() ?? null,
          createdAt: message.createdAt.toISOString(),
        }))}
        appointments={client.portalAppointmentRequests.map((appointment) => ({
          ...appointment,
          preferredStart: appointment.preferredStart.toISOString(),
          alternativeStart: appointment.alternativeStart?.toISOString() ?? null,
          createdAt: appointment.createdAt.toISOString(),
          updatedAt: appointment.updatedAt.toISOString(),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Projets ({client.projects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {client.projects.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Aucun projet relié à ce client.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.status}</Badge>
                    </TableCell>
                    <TableCell>{formatEuro(p.budgetCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Devis récents ({client.quotes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {client.quotes.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Aucun devis relié à ce client.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead>Montant HT</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/dashboard/devis/${q.id}`} className="hover:underline">
                        {q.number}
                      </Link>
                    </TableCell>
                    <TableCell>{q.object}</TableCell>
                    <TableCell>
                      {q.versions[0] ? formatEuro(q.versions[0].totalHtCents) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(q.date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Factures récentes ({client.invoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {client.invoices.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Aucune facture reliée à ce client.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Montant TTC</TableHead>
                  <TableHead>Échéance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/dashboard/factures/${inv.id}`} className="hover:underline">
                        {inv.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{inv.status}</Badge>
                    </TableCell>
                    <TableCell>{formatEuro(inv.totalTtcCents)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
