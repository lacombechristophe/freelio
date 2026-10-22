"use client"

import { useEffect, useState } from "react"
import { getOperationsActivitySummary } from "@/actions/operations"

type Activity = Awaited<ReturnType<typeof getOperationsActivitySummary>>

export function useOperationsActivity(agencyId: string, generatedAt: string, initial: Activity) {
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify([agencyId, generatedAt, revision])
  const [result, setResult] = useState<{ key: string; data: Activity | null; error: boolean } | null>(null)
  useEffect(() => {
    if (agencyId === "ALL") return
    let current = true
    getOperationsActivitySummary({ agencyId }).then(data => {
      if (current) setResult({ key, data, error: false })
    }).catch(() => {
      if (current) setResult({ key, data: null, error: true })
    })
    return () => { current = false }
  }, [agencyId, key, revision])
  return {
    data: agencyId === "ALL" ? initial : result?.key === key ? result.data : null,
    error: agencyId !== "ALL" && result?.key === key && result.error,
    retry: () => setRevision(value => value + 1),
  }
}
