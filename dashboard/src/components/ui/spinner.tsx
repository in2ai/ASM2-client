import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Renders a spinning loader SVG used to indicate a loading state.
 *
 * @param className - Optional additional CSS classes applied to the icon.
 * @param props - Additional SVG props forwarded to the underlying icon component.
 * @returns The rendered `Loader2Icon` SVG with `role="status"` and `aria-label="Loading"`.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }