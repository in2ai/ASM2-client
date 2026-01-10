import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Root container for empty-state UIs.
 *
 * @returns A div element with `data-slot="empty"` that serves as the root empty-state container.
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the header slot for an empty-state layout.
 *
 * @returns A `div` element with `data-slot="empty-header"` and centered layout classes suitable for header content
 */
function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-2 text-center",
        className
      )}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Renders the empty-state media container used for icons or other illustrative media.
 *
 * @param variant - Visual variant to apply; `"default"` uses a transparent base, `"icon"` adds a muted, rounded background and responsive sizing for icon presentation.
 * @param className - Additional CSS classes to merge with the component's base styles.
 * @returns A div element configured as the empty-state media slot with the selected variant and merged classes.
 */
function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

/**
 * Renders the empty-state title element.
 *
 * @returns A `div` element for the empty-state title with preset typography classes and any provided props
 */
function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-lg font-medium tracking-tight", className)}
      {...props}
    />
  )
}

/**
 * Renders the empty-state description slot with muted text and consistent link styling.
 *
 * Applies underline, underline offset, and hover color to child links and sets `data-slot="empty-description"`.
 *
 * @param className - Additional CSS classes to merge with the component's default styles
 * @returns A div element containing descriptive text for an empty state
 */
function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * Wrapper for empty-state content that vertically stacks and centers children.
 *
 * @param className - Additional CSS classes to merge with the component's default styling
 * @returns A div element used as the empty-state content container
 */
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}