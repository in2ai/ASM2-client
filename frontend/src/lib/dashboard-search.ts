import { z } from 'zod'
import { isDashboardView } from '@/app/_components/dashboard-views'

/** Invalid or incomplete URL filters fall back to all dates. */
export const dashboardSearchSchema = z
  .object({
    from: z.iso.date().optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
    view: z
      .string()
      .optional()
      .catch(undefined)
      .transform((value) => (isDashboardView(value) ? value : undefined)),
  })
  .transform((search) => ({
    ...search,
    from:
      search.from && search.to && search.from <= search.to
        ? search.from
        : undefined,
    to:
      search.from && search.to && search.from <= search.to
        ? search.to
        : undefined,
  }))
