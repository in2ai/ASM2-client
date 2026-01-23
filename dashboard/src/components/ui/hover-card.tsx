"use client"

import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"

/**
 * Renders a Radix HoverCard Root with a `data-slot="hover-card"` attribute and forwards all received props.
 *
 * @returns A React element for the Radix HoverCard Root with the `data-slot="hover-card"` attribute and any provided props spread onto it.
 */
function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

/**
 * Render the hover-card trigger element and forward all received props.
 *
 * @returns A trigger element with `data-slot="hover-card-trigger"` and all provided props applied.
 */
function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

/**
 * Renders hover card content inside a portal with built-in styling and animations.
 *
 * Applies a comprehensive set of styling and state/side-dependent animation classes, forwards any additional props, and defaults to `align = "center"` and `sideOffset = 4`.
 *
 * @param className - Additional CSS class names to append to the component's internal classes
 * @param align - Content alignment relative to the trigger (defaults to `"center"`)
 * @param sideOffset - Pixel offset between trigger and content (defaults to `4`)
 * @returns The rendered hover card content element
 */
function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }