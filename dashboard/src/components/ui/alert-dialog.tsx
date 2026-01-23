"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

/**
 * Renders the AlertDialog root element, forwarding all received props and adding a `data-slot="alert-dialog"` attribute for selection and testing.
 *
 * @returns The rendered AlertDialog root element
 */
function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

/**
 * Renders an alert dialog trigger element that forwards all received props and adds a data-slot attribute.
 *
 * @param props - Props forwarded to the underlying AlertDialog trigger element
 * @returns The rendered alert dialog trigger element
 */
function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

/**
 * Renders a Radix AlertDialog Portal with a `data-slot="alert-dialog-portal"` attribute and forwards all props.
 *
 * @param props - Props accepted by `AlertDialogPrimitive.Portal`; all props are forwarded to the underlying portal element.
 * @returns The Portal element annotated with `data-slot="alert-dialog-portal"`.
 */
function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

/**
 * Renders the alert dialog overlay: a full-viewport semi-transparent backdrop with state-based open/close animations.
 *
 * @returns A JSX element representing the alert dialog overlay
 */
function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders dialog content inside a portal with an overlay and applies layout, animation, and styling.
 *
 * Renders a Radix AlertDialog.Content wrapped by the module's AlertDialogPortal and AlertDialogOverlay, merges the provided `className` with the component's default classes (positioning, sizing, animations, and appearance), and forwards all other props to the underlying Content element.
 *
 * @param className - Additional CSS class names to merge with the default content classes.
 * @returns The rendered alert dialog content element.
 */
function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

/**
 * Header container for the AlertDialog, providing vertical layout, spacing, and responsive text alignment.
 *
 * @param className - Additional class names to merge with the component's default layout and alignment classes
 * @returns A JSX element that renders a div annotated with `data-slot="alert-dialog-header"` and forwarded props
 */
function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

/**
 * Layout container for AlertDialog actions and controls.
 *
 * Renders a responsive footer element that arranges children as a column-reverse on small screens and a right-aligned row on larger screens, and forwards all standard div props.
 *
 * @param className - Additional CSS class names to merge with the component's default layout classes
 * @returns The footer container element for an AlertDialog, suitable for housing action buttons and controls
 */
function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the AlertDialog title element with consistent styling and a data-slot attribute.
 *
 * @returns The rendered AlertDialog title element with the `text-lg font-semibold` classes and any additional classes provided via `className`.
 */
function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

/**
 * Renders the alert dialog's description with consistent styling and a data-slot attribute.
 *
 * @returns The AlertDialog description element with theme classes applied.
 */
function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

/**
 * Renders an AlertDialog action element with default button styling and forwards all props to the underlying element.
 *
 * @param className - Additional CSS class names appended to the default button styles
 * @returns The rendered AlertDialog action element with button styles applied
 */
function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      {...props}
    />
  )
}

/**
 * Renders a styled cancel button for an AlertDialog.
 *
 * @returns A Cancel button element that applies the outline button variant styling and forwards all received props to the underlying AlertDialog cancel primitive.
 */
function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}