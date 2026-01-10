import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants, type Button } from "@/components/ui/button"

/**
 * Render a centered navigation container for pagination controls.
 *
 * Merges provided `className` with default centering and layout classes, applies
 * role and aria-label for accessibility, and forwards any other props to the
 * underlying `<nav>` element.
 *
 * @param className - Additional CSS class names to apply to the container
 * @param props - Other props forwarded to the `<nav>` element
 * @returns The `<nav>` element configured as a pagination container
 */
function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

/**
 * Container for pagination items rendered as a horizontal list.
 *
 * Renders an unordered list (<ul>) configured as the pagination content slot with horizontal layout and item spacing. Accepts all standard <ul> props and merges any provided `className` with the default layout classes.
 *
 * @returns The rendered <ul> element with `data-slot="pagination-content"` and horizontal layout classes applied.
 */
function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

/**
 * Renders an li element that serves as a pagination item container.
 *
 * @param props - HTML attributes and children to apply to the `<li>` element
 * @returns The rendered `<li>` element with `data-slot="pagination-item"` and any passed props
 */
function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

/**
 * Renders an accessible pagination link as an anchor element.
 *
 * The rendered anchor includes `aria-current="page"` when active, `data-slot="pagination-link"`,
 * `data-active` set to the active state, and styling based on the `size` and active state.
 *
 * @param className - Additional CSS classes to apply to the anchor
 * @param isActive - Whether this link represents the current page; affects `aria-current` and styling
 * @param size - Visual size variant for the link's button-like styling
 * @returns The configured anchor element to be used as a pagination link
 */
function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders a "previous page" pagination link with a left chevron and a responsive "Previous" label.
 *
 * @param className - Additional class names applied to the link.
 * @param props - Props forwarded to the underlying PaginationLink (e.g., `href`, `isActive`, event handlers).
 * @returns A pagination link configured as the "previous" control with an accessible `aria-label`.
 */
function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden sm:block">Previous</span>
    </PaginationLink>
  )
}

/**
 * Renders a "Next" pagination link with a right-pointing chevron.
 *
 * @param props - Props forwarded to the underlying PaginationLink. Provided `className` is merged with the component's default spacing and gap classes.
 * @returns The pagination link element configured as the "next page" control (includes `aria-label="Go to next page"`, a default size, merged classes, and a right chevron icon).
 */
function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:block">Next</span>
      <ChevronRightIcon />
    </PaginationLink>
  )
}

/**
 * Renders an accessible ellipsis indicator used between pagination items.
 *
 * @returns A span element containing a visual ellipsis icon and a screen-reader-only label "More pages".
 */
function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}