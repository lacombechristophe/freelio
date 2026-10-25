"use client"

import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { useOperationsDirectory } from "./use-operations-directory"

export function ServiceDirectoryControls<T extends { total: number; page: number }>({ title, searchLabel, directory, children }: {
  title: string; searchLabel: string; directory: ReturnType<typeof useOperationsDirectory<T>>; children?: ReactNode
}) {
  return <div className="space-y-3 border-b px-5 py-4">
    <h2 className="text-sm font-semibold">{title}</h2>
    <Input aria-label={searchLabel} placeholder={searchLabel} maxLength={200} value={directory.search} onChange={event => directory.setSearch(event.target.value)} />
    {children ? <div className="flex flex-wrap items-end gap-3">{children}</div> : null}
    <DirectoryPagination total={directory.visible?.total ?? null} page={directory.page} pending={directory.pending} error={directory.error} onPage={directory.setPage} onRetry={directory.retry} />
  </div>
}
