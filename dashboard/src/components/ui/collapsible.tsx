"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

/**
 * Renders a collapsible root element and marks it with `data-slot="collapsible"`.
 *
 * @param props - Props forwarded to the underlying collapsible Root element.
 * @returns The rendered collapsible Root element with `data-slot="collapsible"`.
 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

/**
 * Renders a Radix CollapsibleTrigger with a data-slot attribute and forwards all received props.
 *
 * @param props - Props passed through to the underlying Radix `CollapsibleTrigger` component.
 * @returns The rendered `CollapsibleTrigger` element with `data-slot="collapsible-trigger"`.
 */
function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

/**
 * Renders a Radix CollapsibleContent element with a `data-slot="collapsible-content"` attribute.
 *
 * Renders `CollapsiblePrimitive.CollapsibleContent`, forwarding all received props to the underlying element and ensuring the `data-slot` attribute is present.
 *
 * @returns A `CollapsibleContent` element with forwarded props and `data-slot="collapsible-content"`.
 */
function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }