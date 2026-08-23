import prisma from "@/lib/prisma"
import { getRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function icsDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("")
}

function event(input: { uid: string; title: string; description?: string | null; start: Date; end?: Date | null }) {
  const end = input.end ?? new Date(input.start.getFullYear(), input.start.getMonth(), input.start.getDate() + 1)
  return [
    "BEGIN:VEVENT",
    `UID:${icsText(input.uid)}@freelio.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${icsDate(input.start)}`,
    `DTEND;VALUE=DATE:${icsDate(end)}`,
    `SUMMARY:${icsText(input.title)}`,
    input.description ? `DESCRIPTION:${icsText(input.description)}` : null,
    "END:VEVENT",
  ].filter(Boolean).join("\r\n")
}

export async function GET() {
  const access = await getRouteAuth("operations.read")
  if (!access.ok) return access.response
  const { companyId } = access.context

  const [tasks, goals, milestones] = await Promise.all([
    prisma.organisationTask.findMany({
      where: {
        companyId,
        status: { not: "DONE" },
        OR: [{ scheduledDate: { not: null } }, { dueDate: { not: null } }],
      },
    }),
    prisma.organisationGoal.findMany({
      where: { companyId, status: { not: "DONE" }, periodStart: { not: null } },
    }),
    prisma.projectMilestone.findMany({
      where: { project: { companyId }, status: { not: "DONE" }, dueDate: { not: null } },
      include: { project: { select: { name: true } } },
    }),
  ])

  const events = [
    ...tasks.map((task) => event({ uid: `task-${task.id}`, title: task.title, description: task.notes, start: task.scheduledDate ?? task.dueDate! })),
    ...goals.map((goal) => event({ uid: `goal-${goal.id}`, title: `Objectif : ${goal.title}`, description: goal.description, start: goal.periodStart!, end: goal.periodEnd })),
    ...milestones.map((milestone) => event({ uid: `milestone-${milestone.id}`, title: `${milestone.project.name} : ${milestone.title}`, description: milestone.description, start: milestone.dueDate! })),
  ]
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Freelio//Organisation//FR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n")
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": "attachment; filename=freelio-organisation.ics",
      "cache-control": "no-store",
    },
  })
}
