import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

type MockCapture = { id: number; test_type: string; video_file: string | null; result: null }
type MockAssessment = {
  id: number
  patient: number
  patient_name: string
  eye: string
  assessed_at: string
  captures: MockCapture[]
}
type MockTopographyScan = { id: number; status: string; result: null }

let assessmentData: MockAssessment = {
  id: 55, patient: 3, patient_name: 'A B', eye: 'right', assessed_at: '2026-06-25T00:00:00Z',
  captures: [{ id: 9, test_type: 'nibut', video_file: 'https://cdn/v.mp4', result: null }],
}
let topographyScans: MockTopographyScan[] = []

vi.mock('@/hooks/useAssessments', () => ({ useAssessment: () => ({ data: assessmentData, isLoading: false }) }))
vi.mock('@/hooks/usePractice', () => ({ usePractice: () => ({ data: {} }) }))
vi.mock('@/hooks/useReports', () => ({ useReports: () => ({ data: { results: [] } }), useGenerateReport: () => ({ mutate: vi.fn() }), downloadReportUrl: () => '' }))
vi.mock('@/hooks/useTopography', () => ({ useTopographyScans: () => ({ data: { results: topographyScans } }) }))
vi.mock('@/components/player/VideoReviewPlayer', () => ({ VideoReviewPlayer: ({ source }: { source: string }) => <div data-testid="player">{source}</div> }))

import AssessmentDetailPage from './page'

beforeEach(() => {
  assessmentData = {
    id: 55, patient: 3, patient_name: 'A B', eye: 'right', assessed_at: '2026-06-25T00:00:00Z',
    captures: [{ id: 9, test_type: 'nibut', video_file: 'https://cdn/v.mp4', result: null }],
  }
  topographyScans = []
})

describe('assessment detail video', () => {
  it('renders the compact player and a download link for a capture with a video', () => {
    render(<AssessmentDetailPage params={{ assessmentId: '55' }} />)
    expect(screen.getByTestId('player')).toHaveTextContent('https://cdn/v.mp4')
    const link = screen.getByRole('link', { name: /download .mp4/i })
    expect(link).toHaveAttribute('href', 'https://cdn/v.mp4')
  })
})

describe('assessment detail topography-only', () => {
  it('does not lead with "No captures" when topography scans exist', () => {
    assessmentData = { ...assessmentData, captures: [] }
    topographyScans = [{ id: 7, status: 'analysed', result: null }]
    render(<AssessmentDetailPage params={{ assessmentId: '55' }} />)
    expect(screen.queryByText(/no captures in this assessment/i)).not.toBeInTheDocument()
    expect(screen.getByText(/corneal topography/i)).toBeInTheDocument()
  })
})
