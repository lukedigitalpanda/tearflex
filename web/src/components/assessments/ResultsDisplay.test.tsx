import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultsDisplay } from './ResultsDisplay'

const result = {
  nibut_first_breakup_seconds: 8.2, nibut_mean_breakup_seconds: 9.1, nibut_heatmap: null,
  fluorescein_grade: null, fluorescein_breakup_seconds: null,
  lipid_grade: null, lipid_thickness_nm: null, tear_meniscus_height_mm: null,
  dry_eye_severity: 'mild' as const, confidence_score: 0.8,
}

describe('ResultsDisplay', () => {
  it('shows the NIBUT headline and severity', () => {
    render(<ResultsDisplay result={result as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.getByText(/8.2/)).toBeInTheDocument()
    expect(screen.getByText('Mild')).toBeInTheDocument()
  })
  it('shows "Not assessed" for missing fluorescein', () => {
    render(<ResultsDisplay result={result as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.getAllByText(/not assessed/i).length).toBeGreaterThan(0)
  })
})
