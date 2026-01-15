import { cn } from "@/lib/utils"

/**
 * Render a div placeholder styled as a pulsing skeleton.
 *
 * @param className - Additional CSS class names appended to the base skeleton classes (`bg-accent animate-pulse rounded-md`).
 * @param props - Additional attributes and event handlers spread onto the div.
 * @returns The rendered div element representing a pulsing skeleton placeholder.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }