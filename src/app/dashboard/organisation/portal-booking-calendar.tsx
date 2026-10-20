"use client"

import * as React from "react"
import Link from "next/link"
import { getPortalBookingCalendar } from "@/actions/portal-bookings"
import { Button } from "@/components/ui/button"
import { shiftCalendarDay } from "@/lib/calendar-days"

export function PortalBookingCalendar({ initialDay }: { initialDay: string }) {
  const [day, setDay] = React.useState(initialDay)
  const [page, setPage] = React.useState(1)
  const [reload, setReload] = React.useState(0)
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getPortalBookingCalendar>> | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let current = true; setLoading(true)
    void getPortalBookingCalendar({ from: day, to: shiftCalendarDay(day, 7), page }).then(result => {
      if (current) { setData(result); setLoading(false); setError(result ? "" : "Agenda CRM indisponible.") }
    }).catch(() => { if (current) { setError("Agenda CRM indisponible. Actualisez pour réessayer."); setLoading(false) } })
    return () => { current = false }
  }, [day, page, reload])
  const format = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: data?.timeZone ?? "UTC" }).format(new Date(value))
  return <section className="mt-5 space-y-3 border-t pt-4" aria-busy={loading}>
    <h3 className="text-sm font-semibold">Rendez-vous CRM réservés</h3>
    <p className="text-xs text-muted-foreground">Du {day} au {shiftCalendarDay(day, 6)} · {data?.timeZone ?? "Fuseau de la société"}. Réservations locales ; les calendriers externes ne sont pas vérifiés en temps réel.</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={loading} onClick={() => { setDay(shiftCalendarDay(day, -7)); setPage(1) }}>Semaine précédente</Button>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => { setDay(shiftCalendarDay(day, 7)); setPage(1) }}>Semaine suivante</Button>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => setReload(reload + 1)}>Actualiser l’agenda CRM</Button></div>
    {error ? <p role="alert">{error}</p> : data?.items.map(row => <div key={row.id} className="rounded-lg border p-3 text-sm">
      <Link className="font-medium hover:underline" href={`/dashboard/clients/${row.client.id}?tab=portal`}>{row.subject} · {row.client.name}</Link>
      <p>{format(row.scheduledStart)} – {format(row.scheduledEnd)} · {row.member}{row.status === "COMPLETED" ? " · Terminé" : ""}</p>
    </div>)}
    {!error && data?.total === 0 && <p className="text-xs text-muted-foreground">Aucun rendez-vous CRM réservé sur cette période.</p>}
    <div className="flex flex-wrap items-center gap-2 text-xs"><Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Page précédente</Button>
      <span>{data ? `${data.total} rendez-vous · page ${data.page}` : "Chargement…"}</span>
      <Button variant="outline" size="sm" disabled={loading || !data || data.page * 25 >= data.total} onClick={() => setPage(page + 1)}>Page suivante</Button></div>
  </section>
}
