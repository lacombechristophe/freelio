"use client"

import { useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { parseDirectoryQuery, type DirectoryQuery } from "@/lib/directory-query"

export function useDirectory<T>(resource: string, fetchPage: (query: DirectoryQuery) => Promise<T>, initial?: { data: T; query: DirectoryQuery }) {
  const searchParams = useSearchParams()
  const state = parseDirectoryQuery(searchParams.get("view"))
  const query = useQuery({
    queryKey: ["directory", resource, state],
    initialData: initial && JSON.stringify(initial.query) === JSON.stringify(state) ? initial.data : undefined,
    queryFn: async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 200)
        signal.addEventListener("abort", () => { clearTimeout(timeout); reject(new Error("Recherche remplacée")) }, { once: true })
      })
      return fetchPage(state)
    },
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
  function update(patch: Partial<DirectoryQuery>) {
    const url = new URL(window.location.href)
    const current = parseDirectoryQuery(url.searchParams.get("view"))
    url.searchParams.set("view", JSON.stringify({ ...current, page: 1, ...patch }))
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }
  return { ...query, state, update }
}
