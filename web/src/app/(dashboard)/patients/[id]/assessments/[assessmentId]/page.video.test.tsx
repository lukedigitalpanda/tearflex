import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks/useAssessments', () => ({ useAssessment: () => ({ data: {
  id: 55, patient: 3, patient_name: 'A B', eye: 'right', assessed_at: '2026-06-25T00:00:00Z',
  captures: [{ id: 9, test_type: 'nibut', video_file: 'https://cdn/v.mp4', result: null }],
}, isLoading: false }) }))
vi.mock('@/hooks/usePractice', () => ({ usePractice: () => ({ data: {} }) }))
vi.mock('@/hooks/useReports', () => ({ useReports: () => ({ data: { results: [] } }), useGenerateReport: () => ({ mutate: vi.fn() }), downloadReportUrl: () => '' }))
vi.mock('@/hooks/useTopography', () => ({ useTopographyScans: () => ({ data: { results: [] } }) }))
vi.mock('@/components/player/VideoReviewPlayer', () => ({ VideoReviewPlayer: ({ source }: { source: string }) => <div data-testid="player">{source}</div> }))

import AssessmentDetailPage from './page'

describe('assessment detail video', () => {
  it('renders the compact player and a download link for a capture with a video', () => {
    render(<AssessmentDetailPage params={{ assessmentId: '55' }} />)
    expect(screen.getByTestId('player')).toHaveTextContent('https://cdn/v.mp4')
    const link = screen.getByRole('link', { name: /download .mp4/i })
    expect(link).toHaveAttribute('href', 'https://cdn/v.mp4')
  })
})
