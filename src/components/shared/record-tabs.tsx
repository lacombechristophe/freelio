"use client"

import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function RecordTabs({ sections }: { sections: Array<{ id: string; label: string; content: ReactNode }> }) {
  const params = useSearchParams()
  const selected = sections.find((section) => section.id === params.get("tab"))?.id ?? sections[0]?.id
  return <Tabs value={selected} onValueChange={(value) => {
    const url = new URL(window.location.href)
    url.searchParams.set("tab", String(value))
    window.history.replaceState(null, "", `${url.pathname}${url.search}`)
  }} className="gap-6">
    <div className="max-w-full overflow-x-auto border-b">
      <TabsList variant="line" aria-label="Sections du dossier client" className="h-11 gap-4 p-0">
        {sections.map((section) => <TabsTrigger key={section.id} value={section.id} className="h-11 rounded-none px-1 after:bottom-0! after:bg-primary! data-active:text-primary">{section.label}</TabsTrigger>)}
      </TabsList>
    </div>
    {sections.map((section) => <TabsContent key={section.id} value={section.id} keepMounted className="space-y-5 data-[hidden]:hidden">{section.content}</TabsContent>)}
  </Tabs>
}
