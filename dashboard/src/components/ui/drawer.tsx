"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

/**
 * Renders a Drawer root element with a fixed `data-slot="drawer"` and forwards all props to the underlying primitive.
 *
 * @returns The rendered `DrawerPrimitive.Root` element with `data-slot="drawer"`.
 */
function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

/**
 * Renders a trigger element for the Drawer and forwards received props.
 *
 * @returns A `DrawerPrimitive.Trigger` element with `data-slot="drawer-trigger"` and the provided props applied.
 */
function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

/**
 * Renders a DrawerPrimitive.Portal configured for the drawer and mounts its children.
 *
 * Forwards all received props to the underlying Portal element.
 *
 * @param props - Props passed to DrawerPrimitive.Portal
 * @returns The portal element used to mount drawer content
 */
function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

/**
 * Renders a Drawer close control wired to the underlying Vaul primitive.
 *
 * @returns A `DrawerPrimitive.Close` element with `data-slot="drawer-close"` and all provided props forwarded.
 */
function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

/**
 * Renders the drawer overlay element with default backdrop styling and state-based animations.
 *
 * @param className - Additional CSS classes to merge with the default overlay classes
 * @returns The configured Drawer overlay React element
 */
function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders drawer content inside a portal with an overlay and applies direction-aware layout and styling.
 *
 * This component wraps `DrawerPrimitive.Content` with `DrawerPortal` and `DrawerOverlay`, merges any
 * provided `className` with the component's directional and layout classes, and includes a small
 * visible handle when the drawer is anchored to the bottom.
 *
 * @param className - Additional classes to merge with the component's base and directional styles.
 * @param children - Elements to render inside the drawer content.
 * @returns The drawer content element composed with portal and overlay wrappers.
 */
function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

/**
 * Header container for the Drawer that applies spacing and direction-aware text alignment.
 *
 * @param className - Additional CSS classes to merge with the component's base classes
 * @param props - Other `div` props forwarded to the header element
 * @returns The header `div` element with `data-slot="drawer-header"` and composed className
 */
function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the Drawer footer container used to hold bottom-aligned actions and content.
 *
 * The element has a fixed layout for footer content (vertical stack, gap, padding), includes
 * data-slot="drawer-footer", and merges any provided `className` with the component's base classes.
 *
 * @returns The rendered footer <div> element for the Drawer component.
 */
function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

/**
 * Render the drawer's title with standardized typography and optional additional classes.
 *
 * @returns The `DrawerPrimitive.Title` element with `data-slot="drawer-title"` and merged `text-foreground font-semibold` classes
 */
function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

/**
 * Renders the drawer description slot with base muted typography and an optional `className`.
 *
 * @returns The rendered `DrawerPrimitive.Description` element with `data-slot="drawer-description"` and combined classes (`text-muted-foreground text-sm` plus any provided `className`).
 */
function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}