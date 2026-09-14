"use client"

import { useId, useState } from "react"
import { Tooltip } from "@base-ui/react/tooltip"
import { CircleHelp } from "lucide-react"

export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const descriptionId = useId()

  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger
        type="button"
        aria-label={label}
        aria-describedby={open ? descriptionId : undefined}
        delay={250}
        closeOnClick={false}
        onClick={() => setOpen(true)}
        className="inline-grid size-10 shrink-0 place-items-center rounded-full align-middle text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8} collisionPadding={12} className="z-[70]">
          <Tooltip.Popup id={descriptionId} role="tooltip" className="max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg bg-foreground px-3 py-2 text-left text-xs font-normal leading-5 text-background shadow-lg">
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
