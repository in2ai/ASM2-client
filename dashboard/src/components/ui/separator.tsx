"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/utils"

/**
 * Visual divider component that renders a styled Radix Separator root.
 *
 * @param className - Additional CSS classes to apply to the separator container
 * @param orientation - "horizontal" or "vertical" layout; defaults to "horizontal"
 * @param decorative - Whether the separator is decorative (true sets appropriate accessibility attributes); defaults to `true`
 * @returns A React element rendering a configured `SeparatorPrimitive.Root`
 */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Separator }