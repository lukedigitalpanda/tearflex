import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopographyResult } from './TopographyResult'

const result = {
  id: 1, ring_overlay: null, axial_map: null,
  sim_k_flat: 42.1, sim_k_steep: 44.3, sim_k_axis: 90,
  central_k: 43.2, astigmatism_magnitude: 2.2, astigmatism_axis: 90,
  confidence: 0.82, algorithm_version: 'topo-v0.1',
  calibration_state: 'uncalibrated' as const, analysed_at: '2026-06-24T10:00:00Z',
}

describe('TopographyResult', () => {
  it('shows the central K headline and SimK steep value', () => {
    render(<TopographyResult result={result as never} />)
    expect(screen.getByText('43.20 D')).toBeInTheDocument()
    expect(screen.getByText('44.30 D')).toBeInTheDocument()
  })
  it('always shows the research-use disclaimer and calibration provenance', () => {
    render(<TopographyResult result={result as never} />)
    expect(screen.getByText(/research use only/i)).toBeInTheDocument()
    expect(screen.getByText(/Uncalibrated/)).toBeInTheDocument()
    expect(screen.getByText(/topo-v0\.1/)).toBeInTheDocument()
  })
})
