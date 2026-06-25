import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ assessmentId: '55', testType: 'nibut' }),
}))
const mockLaunch = jest.fn()
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...a: any[]) => mockLaunch(...a) }))

import AcquireScreen from './acquire'

beforeEach(() => { jest.clearAllMocks() })

it('Take navigates to instructions', () => {
  render(<AcquireScreen />)
  fireEvent.press(screen.getByLabelText('Take a video'))
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/assessment/instructions' }))
})

it('Upload picks a video then navigates to review with source=upload', async () => {
  mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://picked.mp4' }] })
  render(<AcquireScreen />)
  fireEvent.press(screen.getByLabelText('Upload a video'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/review',
    params: expect.objectContaining({ assessmentId: '55', testType: 'nibut', videoUri: 'file://picked.mp4', source: 'upload' }),
  })))
})

it('Upload cancelled does not navigate', async () => {
  mockLaunch.mockResolvedValue({ canceled: true })
  render(<AcquireScreen />)
  fireEvent.press(screen.getByLabelText('Upload a video'))
  await waitFor(() => expect(mockLaunch).toHaveBeenCalled())
  expect(mockPush).not.toHaveBeenCalled()
})
