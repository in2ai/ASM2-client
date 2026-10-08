import { describe, expect, it } from 'vite-plus/test'
import { dashboardSearchSchema } from './dashboard-search'

describe('dashboard URL filters', () => {
  it.each([
    { from: 'bad-date', to: '2026-10-06' },
    { from: '2026-02-30', to: '2026-10-06' },
    { from: '2026-10-10', to: '2026-10-06' },
    { from: '2026-10-06' },
    { from: ['2026-10-06'], to: '2026-10-06' },
  ])(
    'clears an invalid or incomplete date range without throwing: %j',
    (search) => {
      expect(dashboardSearchSchema.parse({ ...search, view: 'usage' })).toEqual(
        { view: 'usage', from: undefined, to: undefined },
      )
    },
  )

  it('keeps valid inclusive filters and the selected view', () => {
    const search = { from: '2026-10-06', to: '2026-10-06', view: 'insights' }
    expect(dashboardSearchSchema.parse(search)).toEqual(search)
  })
})
