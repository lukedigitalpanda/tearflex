import { render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockReplace = jest.fn(); const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => ({ assessmentId: '55', captureId: '9', testType: 'nibut', videoUri: 'file://v.mp4', source: 'upload' }),
}))
const mockUseCaptureStatus = jest.fn()
jest.mock('@/hooks/useCaptures', () => ({ useCaptureStatus: (...a: any[]) => mockUseCaptureStatus(...a) }))

import ProcessingScreen from './processing'
beforeEach(() => { jest.clearAllMocks() })

it('navigates to results when analysed', async () => {
  mockUseCaptureStatus.mockReturnValue({ data: { status: 'analysed' }, isTimedOut: false })
  render(<ProcessingScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/results', params: expect.objectContaining({ captureId: '9' }),
  })))
})

it('shows failure on failed status', () => {
  mockUseCaptureStatus.mockReturnValue({ data: { status: 'failed' }, isTimedOut: false })
  render(<ProcessingScreen />)
  expect(screen.getAllByText(/failed|try again/i)[0]).toBeOnTheScreen()
})

it('shows failure on timeout', () => {
  mockUseCaptureStatus.mockReturnValue({ data: { status: 'processing' }, isTimedOut: true })
  render(<ProcessingScreen />)
  expect(screen.getAllByText(/try again|taking longer|timed out/i)[0]).toBeOnTheScreen()
})

import { fireEvent } from '@testing-library/react-native'

it('Try again returns to the review screen with the video + source', () => {
  mockUseCaptureStatus.mockReturnValue({ data: { status: 'failed' }, isTimedOut: false })
  render(<ProcessingScreen />)
  fireEvent.press(screen.getByText('Try again'))
  expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/review',
    params: expect.objectContaining({ assessmentId: '55', testType: 'nibut', videoUri: 'file://v.mp4', source: 'upload' }),
  }))
})
