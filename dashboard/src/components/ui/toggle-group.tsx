"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
})

/**
 * Render a styled toggle group that provides variant, size, and spacing values to its child items.
 *
 * The component wraps Radix UI's ToggleGroup.Root, applies data attributes and CSS variables for styling,
 * composes a base className with any provided `className`, and supplies a ToggleGroupContext to descendants.
 *
 * @param variant - Visual variant to apply to the group and propagate to items (used by `toggleVariants`)
 * @param size - Size key to apply to the group and propagate to items (used by `toggleVariants`)
 * @param spacing - Gap value (numeric) between items; also set as a CSS variable `--gap`. Defaults to 0.
 * @returns The rendered ToggleGroup.Root element with context provided to child ToggleGroupItem components.
 */
function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

/**
 * Renders a toggle group item that uses the ToggleGroupContext values when available and falls back to explicit props.
 *
 * Resolves the effective `variant` and `size` from context or props, exposes `spacing` via a `data-spacing` attribute,
 * and attaches data attributes (`data-slot`, `data-variant`, `data-size`, `data-spacing`) and spacing-aware styling.
 *
 * @returns A Radix `ToggleGroup.Item` element with the resolved variant/size, spacing-aware classes, and data attributes.
 */
function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant ?? variant}
      data-size={context.size ?? size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant ?? variant,
          size: context.size ?? size,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }