"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { documentTitleForPath } from "./route-titles"

export function RouteDocumentTitle() {
  const pathname = usePathname()

  useEffect(() => {
    const syncTitle = () => {
      const heading = document.querySelector("#dashboard-main h1")?.textContent?.trim().replace(/\s+/g, " ")
      const nextTitle = documentTitleForPath(pathname, heading)
      if (document.title !== nextTitle) document.title = nextTitle
    }
    syncTitle()
    const frame = requestAnimationFrame(syncTitle)
    const observer = new MutationObserver(syncTitle)
    // Next.js can stream metadata after hydration by updating the existing
    // title text node. Watching characterData prevents that late update from
    // replacing the contextual record title.
    observer.observe(document.documentElement, { characterData: true, childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pathname])

  return null
}
