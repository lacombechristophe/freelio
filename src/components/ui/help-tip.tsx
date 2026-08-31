import { CircleHelp } from "lucide-react"

export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={label} className="grid size-10 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="size-3.5" /></button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-left text-xs font-normal leading-5 text-background shadow-lg group-hover:block group-focus-within:block">{children}</span>
    </span>
  )
}
