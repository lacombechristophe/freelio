"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { titleForPath } from "./route-titles"

export function RouteDocumentTitle() {
  const pathname = usePathname()

  useEffect(() => {
    const syncTitle = () => {
      const heading = document.querySelector("#dashboard-main h1")?.textContent?.trim().replace(/\s+/g, " ")
      const routeTitle = titleForPath(pathname)
      const contextualTitle = heading && heading !== routeTitle
        ? `${routeTitle} · ${heading.slice(0, 64)}`
        : routeTitle
      const nextTitle = `${contextualTitle} | Freelio`
      if (document.title !== nextTitle) document.title = nextTitle
    }
    syncTitle()
    const frame = requestAnimationFrame(syncTitle)
    const observer = new MutationObserver(syncTitle)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pathname])

  return null
}
