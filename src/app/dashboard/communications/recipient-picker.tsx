"use client"

import { useEffect, useState, useTransition } from "react"
import { getCommunicationRecipients } from "@/actions/communications"
import type { RecipientPage } from "@/lib/communications/recipient-reader"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RecipientPicker({ initialPage, value, onChange }: { initialPage: RecipientPage; value: string; onChange: (id: string) => void }) {
  const [data, setData] = useState(initialPage)
  const [search, setSearch] = useState(initialPage.search)
  const [page, setPage] = useState(initialPage.page)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const next = await getCommunicationRecipients({ search, page, selectedId: value || undefined })
        if (!active || !next) return
        setData(next)
        setError(false)
        if (value && !next.selectedContact) onChange("")
      } catch {
        if (active) setError(true)
      }
    }), 250)
    return () => { active = false; clearTimeout(timer) }
  }, [search, page, value, attempt, onChange])
  const contacts = data.selectedContact && !data.contacts.some(contact => contact.id === data.selectedContact!.id)
    ? [data.selectedContact, ...data.contacts] : data.contacts
  return <div className="space-y-1.5" aria-busy={pending}>
    <Label htmlFor="email-recipient-search">Rechercher un destinataire</Label>
    <Input id="email-recipient-search" value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setPage(1) }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault() }} />
    <Label htmlFor="email-contact">Destinataire</Label>
    <select id="email-contact" name="contactId" value={value} onChange={event => onChange(event.target.value)} required disabled={pending} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm">
      <option value="">Sélectionner un contact…</option>
      {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} · {contact.email} — {contact.client.name}</option>)}
    </select>
    <DirectoryPagination total={data.total} page={data.page} pending={pending} error={error} onPage={setPage} onRetry={() => setAttempt(value => value + 1)} />
  </div>
}
