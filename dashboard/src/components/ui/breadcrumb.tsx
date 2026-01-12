import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Renders the root breadcrumb navigation container.
 *
 * @returns A `nav` element with `aria-label="breadcrumb"` and `data-slot="breadcrumb"` with any received props applied.
 */
function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />
}

/**
 * Renders an ordered list container for breadcrumb items with default layout and spacing.
 *
 * @param className - Additional class names to merge with the component's default styles
 * @param props - Additional props are forwarded to the underlying `ol` element
 * @returns The rendered `ol` element serving as the breadcrumb list
 */
function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders a breadcrumb list item (<li>) with slot metadata and default layout classes.
 *
 * @param className - Optional additional CSS classes to merge with the component's default classes
 * @returns The rendered `<li>` element configured as a breadcrumb item
 */
function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  )
}

/**
 * Render a breadcrumb link as an anchor or as a custom child component when `asChild` is true.
 *
 * Renders an element with breadcrumb-specific attributes and classes, forwarding all other props to the rendered element.
 *
 * @param asChild - When true, renders the provided child component (via `Slot`) instead of an `a` element.
 * @param className - Additional class names to merge with the breadcrumb link's default classes.
 * @param props - Additional props forwarded to the rendered element.
 * @returns The rendered link element (`a` or the provided child component) configured for breadcrumb usage.
 */
function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn("hover:text-foreground transition-colors", className)}
      {...props}
    />
  )
}

/**
 * Renders a non-interactive breadcrumb page label indicating the current page.
 *
 * The element is a span with accessibility attributes set for a current, disabled breadcrumb
 * item (`role="link"`, `aria-disabled="true"`, `aria-current="page"`). Additional props and
 * `className` are forwarded to the element.
 *
 * @returns A span element representing the current breadcrumb page with the appropriate ARIA attributes.
 */
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("text-foreground font-normal", className)}
      {...props}
    />
  )
}

/**
 * Renders a breadcrumb separator list item that displays either custom content or a default chevron.
 *
 * @param children - Optional custom separator content to render instead of the default chevron icon.
 * @param className - Additional CSS classes to apply to the separator element.
 * @returns The rendered `<li>` element used as a breadcrumb separator, containing `children` or a ChevronRight icon.
 */
function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
}

/**
 * Renders an ellipsis indicator used as a breadcrumb separator.
 *
 * The element is a non-interactive, presentation-only span containing a MoreHorizontal icon
 * and visually hidden "More" text for screen readers.
 *
 * @returns A span element used to indicate truncated breadcrumb items (ellipsis).
 */
function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}