import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeWrapper } from '@/test/queryWrapper'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const createAssessment = vi.fn().mockResolvedValue({ id: 55 })
const uploadCapture = vi.fn().mockResolvedValue({ id: 9, status: 'processing' })
const uploadManual = vi.fn().mockResolvedValue({ id: 10 })
const createStill = vi.fn().mockResolvedValue({ id: 1 })
vi.mock('@/hooks/useAssessments', () => ({ useCreateAssessment: () => ({ mutateAsync: createAssessment }) }))
vi.mock('@/hooks/useCaptures', () => ({
  useUploadCapture: () => ({ mutateAsync: uploadCapture }),
  useUploadManualCapture: () => ({ mutateAsync: uploadManual }),
  useCreateCaptureStill: () => ({ mutateAsync: createStill }),
  useCaptureStatus: () => ({ data: { id: 9, status: 'analysed' } }),
}))
vi.mock('@/components/player/VideoReviewPlayer', () => ({
  VideoReviewPlayer: () => <div data-testid="player" />,
}))

import { UploadAssessmentFlow } from './UploadAssessmentFlow'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
})

function selectFile() {
  const input = screen.getByLabelText(/choose a video/i)
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'v.mp4', { type: 'video/mp4' })], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('UploadAssessmentFlow', () => {
  it('auto path: creates assessment + capture then navigates after analysed', async () => {
    render(<UploadAssessmentFlow patientId={3} eye="right" />, { wrapper: makeWrapper() })
    // pick-test default nibut → continue
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    selectFile()
    await userEvent.click(await screen.findByRole('button', { name: /auto-analyse/i }))
    await waitFor(() => expect(createAssessment).toHaveBeenCalledWith({ patient: 3, eye: 'right' }))
    await waitFor(() => expect(uploadCapture).toHaveBeenCalledWith(expect.objectContaining({ assessment: 55, test_type: 'nibut' })))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients/3/assessments/55'))
  })
})
