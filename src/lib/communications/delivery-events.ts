const EVENT_STATUSES: Record<string, string> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.delivery_delayed": "DELAYED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.bounced": "BOUNCED",
  "email.failed": "FAILED",
  "email.complained": "COMPLAINED",
  "email.suppressed": "SUPPRESSED",
}

const STATUS_RANK: Record<string, number> = {
  SCHEDULED: 0,
  SENDING: 1,
  SENT: 10,
  DELAYED: 20,
  DELIVERED: 30,
  OPENED: 40,
  CLICKED: 50,
  BOUNCED: 100,
  FAILED: 100,
  DEAD_LETTER: 100,
  COMPLAINED: 110,
  SUPPRESSED: 110,
  CANCELED: 120,
}

export function emailDeliveryStatusForEvent(type: string) {
  return EVENT_STATUSES[type]
}

export function emailEventCanReplaceAtSameTime(currentStatus: string, nextStatus: string) {
  return (STATUS_RANK[nextStatus] ?? 0) >= (STATUS_RANK[currentStatus] ?? 0)
}

export function emailEventUpdateGuard(status: string, occurredAt: Date) {
  const replaceableStatuses = Object.keys(STATUS_RANK).filter((candidate) => emailEventCanReplaceAtSameTime(candidate, status))
  return {
    AND: [
      { status: { in: replaceableStatuses } },
      { OR: [{ lastEventAt: null }, { lastEventAt: { lte: occurredAt } }] },
    ],
    OR: [
      { lastEventAt: null },
      { lastEventAt: { lt: occurredAt } },
      { lastEventAt: occurredAt, status: { in: replaceableStatuses } },
    ],
  }
}
