import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

/**
 * Renders a list container for grouped item components.
 *
 * Applies role="list" and data-slot="item-group", merges base layout classes with any provided `className`, and forwards remaining props to the underlying `div`.
 */
function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn("group/item-group flex flex-col", className)}
      {...props}
    />
  )
}

/**
 * Renders a horizontal separator tailored for item lists.
 *
 * Applies a data-slot of `"item-separator"`, sets `orientation` to `"horizontal"`,
 * merges the base `"my-0"` class with any provided `className`, and forwards all other props to `Separator`.
 *
 * @returns A `Separator` element configured as a horizontal item separator.
 */
function ItemSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("my-0", className)}
      {...props}
    />
  )
}

const itemVariants = cva(
  "group/item flex items-center border border-transparent text-sm rounded-md transition-colors [a]:hover:bg-accent/50 [a]:transition-colors duration-100 flex-wrap outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border",
        muted: "bg-muted/50",
      },
      size: {
        default: "p-4 gap-4 ",
        sm: "py-3 px-4 gap-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Render a polymorphic item container with configurable visual variant and size.
 *
 * @param className - Additional CSS class names to merge with the component's computed classes
 * @param variant - Visual variant to apply; supported values include `"default"`, `"outline"`, and `"muted"`
 * @param size - Size variant to apply; supported values include `"default"` and `"sm"`
 * @param asChild - If `true`, render a Radix `Slot` so a consumer-provided element becomes the DOM node; otherwise render a `div`
 * @param props - Other props forwarded to the rendered element
 * @returns The rendered item element with `data-slot="item"`, `data-variant`, and `data-size` attributes and computed classes
 */
function Item({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={cn(itemVariants({ variant, size, className }))}
      {...props}
    />
  )
}

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none group-has-[[data-slot=item-description]]/item:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 border rounded-sm bg-muted [&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 rounded-sm overflow-hidden [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Renders the item's media container with styling determined by `variant`.
 *
 * @param className - Additional CSS classes to merge onto the media container
 * @param variant - Visual mode for the media container: `"default"` (neutral container), `"icon"` (sized, bordered icon container), or `"image"` (rounded image container with overflow handling)
 * @returns A div element configured as the item's media container
 */
function ItemMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

/**
 * Renders the main content container for an item with slot metadata and layout classes.
 *
 * The element receives data-slot="item-content" and applies a flexible, columnar layout
 * that grows to fill available space while preventing subsequent sibling content slots from flexing.
 *
 * @returns A `div` element used as the item's content area with appropriate layout classes and `data-slot="item-content"`.
 */
function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn(
        "flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the item's title slot with compact typography, horizontal alignment, and spacing for adjacent elements.
 *
 * @returns The title container element (`div`) with `data-slot="item-title"` and styling for a compact, single-line title.
 */
function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders an item description paragraph with preset typography, two-line clamping, and link styling.
 *
 * The element includes a `data-slot="item-description"` attribute to support slot-based composition.
 */
function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "text-muted-foreground line-clamp-2 text-sm leading-normal font-normal text-balance",
        "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders a layout container for action controls associated with an item.
 *
 * The element includes data-slot="item-actions" and baseline flex spacing classes; additional
 * className and other div props are merged and forwarded.
 *
 * @returns A div element that contains item action controls
 */
function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

/**
 * Renders the header region for an item, laid out to justify content between start and end.
 *
 * @param className - Additional CSS classes to apply to the header container
 * @returns A div element with `data-slot="item-header"` and flex layout classes for header content
 */
function ItemHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-header"
      className={cn(
        "flex basis-full items-center justify-between gap-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the footer area for an item, providing a flex layout that spaces and aligns footer content.
 *
 * The element is marked with `data-slot="item-footer"` and accepts additional props (including `className`) which are merged into the container.
 *
 * @returns The footer container element for an item, with classes to justify content between and maintain gaps.
 */
function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-footer"
      className={cn(
        "flex basis-full items-center justify-between gap-2",
        className
      )}
      {...props}
    />
  )
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
}