import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ assessmentId: '55', testType: 'nibut', videoUri: 'file://v.mp4', source: 'upload' }),
}))
jest.mock('@/components/player/MobileVideoReviewPlayer', () => ({
  MobileVideoReviewPlayer: () => null,
}))
const mockUploadAuto = jest.fn().mockResolvedValue({ id: 9, status: 'processing' })
const mockUploadManual = jest.fn().mockResolvedValue({ id: 10 })
const mockCreateStill = jest.fn().mockResolvedValue({ id: 1 })
jest.mock('@/hooks/useCaptures', () => ({
  useUploadCapture: () => ({ mutateAsync: mockUploadAuto }),
  useUploadManualCapture: () => ({ mutateAsync: mockUploadManual }),
  useCreateCaptureStill: () => ({ mutateAsync: mockCreateStill }),
}))
const mockPatch = jest.fn().mockResolvedValue({})
const mockPost = jest.fn().mockResolvedValue({})
jest.mock('@/lib/api', () => ({ api: { patch: (...a: any[]) => mockPatch(...a), post: (...a: any[]) => mockPost(...a) } }))

import ReviewScreen from './review'
beforeEach(() => { jest.clearAllMocks() })

it('auto path: creates capture then navigates to processing', async () => {
  render(<ReviewScreen />)
  fireEvent.press(screen.getByLabelText('Auto-analyse'))
  await waitFor(() => expect(mockUploadAuto).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 55, testType: 'nibut', source: 'upload', videoUri: 'file://v.mp4' })))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/processing',
    params: expect.objectContaining({ assessmentId: '55', captureId: '9', testType: 'nibut', videoUri: 'file://v.mp4', source: 'upload' }),
  })))
})

it('manual path: records result, patches complete, navigates to results', async () => {
  render(<ReviewScreen />)
  fireEvent.press(screen.getByLabelText('Enter manually'))
  fireEvent.changeText(screen.getByLabelText('First break-up (s)'), '7.2')
  fireEvent.press(screen.getByLabelText('Save'))
  await waitFor(() => expect(mockUploadManual).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 55, source: 'upload', results: expect.objectContaining({ nibut_first_breakup_seconds: 7.2 }) })))
  await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('assessments/55/', { status: 'complete' }))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/assessment/results' })))
})

it('manual retry after a failed complete-patch does not recreate the capture', async () => {
  mockPatch.mockRejectedValueOnce(new Error('net')).mockResolvedValue({})
  render(<ReviewScreen />)
  fireEvent.press(screen.getByLabelText('Enter manually'))
  fireEvent.changeText(screen.getByLabelText('First break-up (s)'), '7.2')
  fireEvent.press(screen.getByLabelText('Save'))               // 1st attempt: create ok, patch fails
  await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByLabelText('Save'))               // retry: skip create, patch succeeds
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/assessment/results' })))
  expect(mockUploadManual).toHaveBeenCalledTimes(1)            // capture created ONCE across both attempts
})
