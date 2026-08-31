"use client"

import dynamic from "next/dynamic"
import { useRef, useState, useTransition } from "react"
import { Activity, FileText, LayoutDashboard, Send, Workflow } from "lucide-react"
import { toast } from "sonner"

import type { AutomationData, NavigationItem } from "@/app/dashboard/automatisations/automation-model"
import { AutomationOverview } from "@/app/dashboard/automatisations/automation-overview"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SequenceStudio = dynamic(() => import("@/app/dashboard/automatisations/sequence-studio").then((module) => module.SequenceStudio))
const TemplateStudio = dynamic(() => import("@/app/dashboard/automatisations/template-studio").then((module) => module.TemplateStudio))
const WorkflowStudio = dynamic(() => import("@/app/dashboard/automatisations/workflow-studio").then((module) => module.WorkflowStudio))
const DeliveryJournal = dynamic(() => import("@/app/dashboard/automatisations/delivery-journal").then((module) => module.DeliveryJournal))

const navigation: NavigationItem[] = [
  { value: "overview", label: "Vue d’ensemble", icon: LayoutDashboard },
  { value: "sequences", label: "Séquences", icon: Send },
  { value: "workflows", label: "Workflows", icon: Workflow },
  { value: "templates", label: "Modèles", icon: FileText },
  { value: "history", label: "Journal", icon: Activity },
]

export function AutomationCenter({ initialData }: { initialData: AutomationData }) {
  const [tab, setTab] = useState("overview")
  const [isPending, startTransition] = useTransition()
  const tabsScrollerRef = useRef<HTMLDivElement>(null)
  const counts: Record<string, number> = { sequences: initialData.sequences.length, workflows: initialData.workflows.length, templates: initialData.templates.length, history: initialData.deliveries.length }

  function selectTab(nextTab: string) {
    setTab(nextTab)
    window.requestAnimationFrame(() => {
      const trigger = Array.from(tabsScrollerRef.current?.querySelectorAll<HTMLElement>("[data-automation-tab]") ?? []).find(
        (item) => item.dataset.automationTab === nextTab,
      )
      trigger?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      })
    })
  }

  function run(operation: () => Promise<unknown>, successMessage: string, options?: { form?: HTMLFormElement; after?: () => void }) {
    startTransition(async () => {
      try {
        await operation()
        options?.form?.reset()
        options?.after?.()
        toast.success(successMessage)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action impossible")
      }
    })
  }

  return <Tabs value={tab} onValueChange={selectTab} className="space-y-5">
    <div ref={tabsScrollerRef} className="sticky top-0 z-20 -mx-1 overflow-x-auto border-b border-border/70 bg-background/95 px-1 py-1 backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsList aria-label="Sections des automatisations" variant="line" className="min-w-max">
        {navigation.map((item) => <TabsTrigger key={item.value} value={item.value} data-automation-tab={item.value}><item.icon />{item.label}{counts[item.value] !== undefined && <Badge variant="secondary" className="ml-1 min-w-5 justify-center px-1.5 tabular-nums">{counts[item.value]}</Badge>}</TabsTrigger>)}
      </TabsList>
    </div>

    <TabsContent value="overview"><AutomationOverview data={initialData} pending={isPending} run={run} onNavigate={setTab} /></TabsContent>
    <TabsContent value="sequences">{tab === "sequences" && <SequenceStudio data={initialData} pending={isPending} run={run} />}</TabsContent>
    <TabsContent value="workflows">{tab === "workflows" && <WorkflowStudio data={initialData} pending={isPending} run={run} />}</TabsContent>
    <TabsContent value="templates">{tab === "templates" && <TemplateStudio data={initialData} pending={isPending} run={run} />}</TabsContent>
    <TabsContent value="history">{tab === "history" && <DeliveryJournal data={initialData} pending={isPending} run={run} />}</TabsContent>
  </Tabs>
}
