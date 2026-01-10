import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Render a styled textarea that forwards all standard textarea props.
 *
 * Applies a set of default utility classes (focus, disabled, dark mode, sizing, and interaction styles)
 * merged with an optional `className`, and spreads remaining props onto the underlying `<textarea>` element.
 *
 * @param className - Optional additional CSS class names to merge with the component's default classes
 * @returns The `<textarea>` element with composed classes and forwarded props
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }