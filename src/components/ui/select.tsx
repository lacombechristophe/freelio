"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

type SelectItems = SelectPrimitive.Root.Props<unknown>["items"]

function deriveItemsFromChildren(children: React.ReactNode): SelectItems {
  const items: Array<{ label: React.ReactNode; value: unknown }> = []

  function visit(node: React.ReactNode) {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return

      const props = child.props as {
        children?: React.ReactNode
        label?: React.ReactNode
        value?: unknown
      }

      const isSelectItem =
        child.type === SelectItem ||
        (typeof child.type === "function" && child.type.name === "SelectItem")

      if (isSelectItem && "value" in props) {
        items.push({
          value: props.value,
          label: props.label ?? props.children,
        })
        return
      }

      if (props.children) {
        visit(props.children)
      }
    })
  }

  visit(children)
  return items.length > 0 ? items : undefined
}

function Select<Value, Multiple extends boolean | undefined = false>({
  children,
  items,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const resolvedItems = React.useMemo(
    () => items ?? deriveItemsFromChildren(children),
    [children, items]
  )

  return (
    <SelectPrimitive.Root items={resolvedItems} {...props}>
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-card py-2 pr-3 pl-3 text-sm whitespace-nowrap shadow-[0_1px_2px_rgba(16,24,40,0.02)] transition-[border-color,box-shadow,background-color] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-10 data-[size=sm]:h-9 data-[size=sm]:rounded-[9px] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  positionMethod = "fixed",
  collisionPadding = 8,
  disableAnchorTracking = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "alignItemWithTrigger"
    | "positionMethod"
    | "collisionPadding"
    | "disableAnchorTracking"
  >) {
  const [positionerElement, setPositionerElement] = React.useState<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!positionerElement) return
    const currentPositioner = positionerElement

    let frame = 0
    let trackingFrame = 0
    let trackedTrigger: HTMLElement | null = null
    let offset: { x: number; y: number } | null = null

    function getTrigger() {
      const list = currentPositioner.querySelector<HTMLElement>("[role='listbox'][id]")
      const listId = list?.id
      const openTriggers = Array.from(
        document.querySelectorAll<HTMLElement>("[data-slot='select-trigger'][aria-expanded='true']")
      )

      if (listId) {
        return openTriggers.find((trigger) => trigger.getAttribute("aria-controls") === listId) ?? null
      }

      return openTriggers.at(-1) ?? null
    }

    function syncPosition(resetOffset = false) {
      frame = 0
      if (!currentPositioner.matches("[data-open]")) return

      const trigger = getTrigger()
      if (!trigger) return

      if (resetOffset || trigger !== trackedTrigger || !offset) {
        const positionerRect = currentPositioner.getBoundingClientRect()
        const triggerRect = trigger.getBoundingClientRect()
        if (positionerRect.left === 0 && Math.abs(triggerRect.left) > 1) return

        trackedTrigger = trigger
        offset = {
          x: positionerRect.left - triggerRect.left,
          y: positionerRect.top - triggerRect.top,
        }
      }

      const triggerRect = trigger.getBoundingClientRect()
      currentPositioner.style.left = `${triggerRect.left + offset.x}px`
      currentPositioner.style.top = `${triggerRect.top + offset.y}px`
    }

    function scheduleSync(resetOffset = false) {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => syncPosition(resetOffset))
    }

    function startTracking(resetOffset = false) {
      if (trackingFrame) cancelAnimationFrame(trackingFrame)
      syncPosition(resetOffset)

      const tick = () => {
        syncPosition()
        trackingFrame = currentPositioner.matches("[data-open]") ? requestAnimationFrame(tick) : 0
      }

      trackingFrame = requestAnimationFrame(tick)
    }

    const observer = new MutationObserver(() => startTracking(true))
    observer.observe(currentPositioner, { attributes: true, attributeFilter: ["data-open"] })

    const handleScroll = () => scheduleSync()
    const handleResize = () => scheduleSync(true)

    startTracking(true)
    document.addEventListener("scroll", handleScroll, true)
    window.addEventListener("resize", handleResize)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      if (trackingFrame) cancelAnimationFrame(trackingFrame)
      observer.disconnect()
      document.removeEventListener("scroll", handleScroll, true)
      window.removeEventListener("resize", handleResize)
    }
  }, [positionerElement])

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        ref={setPositionerElement}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        positionMethod={positionMethod}
        collisionPadding={collisionPadding}
        disableAnchorTracking={disableAnchorTracking}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>
            <SelectPrimitive.Group data-slot="select-content-group">
              {children}
            </SelectPrimitive.Group>
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
