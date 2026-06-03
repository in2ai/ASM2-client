// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
  ChartVisibilityProvider,
  useChartVisibility,
} from './chart-visibility-context'

function VisibilityHarness() {
  const {
    actions: { hideAllCharts, showAllCharts, toggleChart },
    state: { visibility },
  } = useChartVisibility()

  const visibleCount = Object.values(visibility).filter(Boolean).length

  return (
    <div>
      <output aria-label="visible-count">{visibleCount}</output>
      <output aria-label="activity-visible">
        {visibility.activityTrend ? 'visible' : 'hidden'}
      </output>
      <button onClick={() => toggleChart('activityTrend')}>toggle</button>
      <button onClick={hideAllCharts}>hide all</button>
      <button onClick={showAllCharts}>show all</button>
    </div>
  )
}

describe('ChartVisibilityProvider', () => {
  afterEach(() => {
    cleanup()
  })

  it('toggles individual charts and bulk visibility', () => {
    render(
      <ChartVisibilityProvider>
        <VisibilityHarness />
      </ChartVisibilityProvider>,
    )

    expect(screen.getByLabelText('visible-count').textContent).toBe('8')
    expect(screen.getByLabelText('activity-visible').textContent).toBe(
      'visible',
    )

    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByLabelText('visible-count').textContent).toBe('7')
    expect(screen.getByLabelText('activity-visible').textContent).toBe('hidden')

    fireEvent.click(screen.getByText('hide all'))
    expect(screen.getByLabelText('visible-count').textContent).toBe('0')

    fireEvent.click(screen.getByText('show all'))
    expect(screen.getByLabelText('visible-count').textContent).toBe('8')
  })
})
