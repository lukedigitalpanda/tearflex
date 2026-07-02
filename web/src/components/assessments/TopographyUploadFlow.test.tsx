import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeWrapper } from '@/test/queryWrapper'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const createAssessment = vi.fn().mockResolvedValue({ id: 55 })
vi.mock('@/hooks/useAssessments', () => ({
  useCreateAssessment: () => ({ mutateAsync: createAssessment }),
}))

const createScan = vi.fn().mockResolvedValue({ id: 9, status: 'processing' })
let scanStatus: { data?: { id: number; status: string }; isTimedOut: boolean } = {
  data: { id: 9, status: 'analysed' },
  isTimedOut: false,
}
vi.mock('@/hooks/useTopography', () => ({
  useCreateTopographyScan: () => ({ mutateAsync: createScan }),
  useTopographyScanStatus: () => scanStatus,
}))

import { TopographyUploadFlow } from './TopographyUploadFlow'

beforeAll(() => {
  // jsdom lacks object-URL support; the picker only needs stable unique strings
  let n = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${n++}`),
    revokeObjectURL: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  scanStatus = { data: { id: 9, status: 'analysed' }, isTimedOut: false }
})

const img = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

describe('TopographyUploadFlow', () => {
  it('happy path: creates assessment + scan, navigates once analysed', async () => {
    render(<TopographyUploadFlow patientId={3} eye="right" />, { wrapper: makeWrapper() })

    await userEvent.upload(screen.getByLabelText(/choose topography images/i), [img('a.jpg'), img('b.jpg')])

    const submit = await screen.findByRole('button', { name: /upload 2 images & analyse/i })
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    await waitFor(() => expect(createAssessment).toHaveBeenCalledWith({ patient: 3, eye: 'right' }))
    await waitFor(() => expect(createScan).toHaveBeenCalledWith({
      assessment: 55,
      stills: [expect.any(File), expect.any(File)],
    }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients/3/assessments/55'))
  })

  it('submit disabled with no images', () => {
    render(<TopographyUploadFlow patientId={3} eye="right" />, { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /upload & analyse/i })).toBeDisabled()
  })

  it('failed scan: retry returns to the picker with files retained', async () => {
    scanStatus = { data: { id: 9, status: 'failed' }, isTimedOut: false }
    render(<TopographyUploadFlow patientId={3} eye="right" />, { wrapper: makeWrapper() })

    // drive to processing
    await userEvent.upload(screen.getByLabelText(/choose topography images/i), [img('a.jpg')])
    await userEvent.click(await screen.findByRole('button', { name: /upload 1 image & analyse/i }))
    await waitFor(() => expect(createScan).toHaveBeenCalled())

    expect(await screen.findByText(/analysis failed/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    // back on the picker, with the previously chosen file still there
    expect(screen.getByLabelText(/add more images/i)).toBeInTheDocument()
    expect(screen.getByAltText('a.jpg')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
