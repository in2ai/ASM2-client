"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Renders a Radix Sheet root element with a standardized data-slot and forwarded props.
 *
 * @param props - Props to pass through to Radix's SheetRoot component
 * @returns The Sheet root React element with data-slot="sheet" and all provided props applied
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

/**
 * Renders a Sheet trigger element with a standardized data-slot attribute.
 *
 * @returns A Radix Sheet Trigger element with forwarded props and `data-slot="sheet-trigger"`.
 */
function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

/**
 * Renders a sheet close trigger element with a standardized `data-slot="sheet-close"`.
 *
 * @param props - Props forwarded to the underlying Close primitive
 * @returns The Close trigger element for the Sheet
 */
function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * Renders a portal container for sheet content and forwards all received props.
 *
 * @returns A portal element with `data-slot="sheet-portal"` and all provided props applied.
 */
function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/**
 * Renders the sheet backdrop overlay with standardized animation, visibility, and layering styles.
 *
 * Merges the provided `className` with the component's default backdrop and animation classes and forwards remaining props to Radix's Overlay.
 *
 * @param className - Additional CSS class names to merge with the default overlay styles
 * @returns The Radix Overlay element with `data-slot="sheet-overlay"` and the combined `className`
 */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the sheet's content area inside a portal with an overlay and a built-in close control, placing and animating the panel from the specified side.
 *
 * @param side - Which edge the sheet slides in from: `"top"`, `"right"`, `"bottom"`, or `"left"`. Defaults to `"right"`.
 * @param className - Additional CSS classes to merge with the component's base styles.
 * @param children - Elements displayed inside the sheet content.
 * @returns The rendered sheet content element.
 */
function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/**
 * Renders the sheet header container used to wrap header content.
 *
 * Applies default vertical layout, spacing, and padding classes and merges any provided `className`.
 *
 * @returns A `div` element with `data-slot="sheet-header"` and the combined header classes.
 */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

/**
 * Renders a sheet footer container with standardized layout, spacing, and a data-slot attribute.
 *
 * @param className - Additional CSS classes to merge with the component's default footer classes
 * @returns A `div` element with `data-slot="sheet-footer"`, merged class names, and any other props spread onto it
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

/**
 * Renders the sheet's title element with standardized text styles.
 *
 * Applies default font and color classes and forwards any additional props to the underlying title element; the `className` prop is merged with the defaults.
 *
 * @returns The sheet title element styled with default classes merged with `className`
 */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

/**
 * Renders a sheet description element with standard muted and small-text styling and a `data-slot="sheet-description"` attribute.
 *
 * @param className - Additional CSS classes to merge with the component's default text styles
 * @returns The rendered sheet description element
 */
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}