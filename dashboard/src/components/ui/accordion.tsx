"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Renders a Radix UI Accordion root and forwards all received props while adding a `data-slot="accordion"` attribute.
 *
 * @param props - Props to pass through to the underlying Radix Accordion Root element
 * @returns The rendered Accordion root element with `data-slot="accordion"` and all provided props applied
 */
function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

/**
 * Renders a styled Accordion item that wraps Radix's Accordion.Item and applies project-default border classes.
 *
 * @param className - Additional CSS classes appended to the default `"border-b last:border-b-0"` classes
 * @returns The Accordion item element with `data-slot="accordion-item"`
 */
function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

/**
 * Renders a styled accordion trigger wrapped in a header and accompanied by a chevron icon.
 *
 * @param className - Additional CSS class names to merge with the component's default styles.
 * @param children - Trigger label or content shown before the chevron icon.
 * @returns The rendered Accordion trigger element.
 */
function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

/**
 * Renders an Accordion content pane connected to Radix Accordion with project-specific styling and layout.
 *
 * Applies open/closed animations, overflow handling, and a data-slot attribute; wraps children in a padded container.
 *
 * @returns The rendered Accordion content element (`AccordionPrimitive.Content`) containing the provided children.
 */
function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }