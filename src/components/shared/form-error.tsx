"use client"

import { useEffect, useRef } from "react"
import { AlertCircle } from "lucide-react"

export function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  if (!message) return null
  return <div ref={ref} role="alert" tabIndex={-1} className="flex scroll-mt-24 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-danger focus:outline-2 focus:outline-offset-2 focus:outline-ring">
    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <p>{message}</p>
  </div>
}
