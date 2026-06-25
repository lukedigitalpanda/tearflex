import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ captureId: '9', testType: 'nibut' }),
}))
jest.mock('@/components/player/MobileVideoReviewPlayer', () => ({ MobileVideoReviewPlayer: () => null }))
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: { video_file: 'https://cdn/v.mp4', result: null, test_type: 'nibut', assessment: 1, id: 9, status: 'analysed', captured_at: '2026-01-01T00:00:00Z' }, isLoading: false, isError: false }),
}))
const mockDownloadAsync = jest.fn().mockResolvedValue({ uri: 'file://cache/capture_video.mp4' })
const mockShareAsync = jest.fn().mockResolvedValue(undefined)
jest.mock('expo-file-system', () => ({ cacheDirectory: 'file://cache/', downloadAsync: (...a: any[]) => mockDownloadAsync(...a) }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (...a: any[]) => mockShareAsync(...a) }))
jest.mock('@/hooks/useReports', () => ({
  useGeneratePDFReport: () => ({ generateAndGetUrl: jest.fn(), isGenerating: false, pdfError: null }),
}))
jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }))
jest.mock('@/components/results/NIBUTResult', () => ({ NIBUTResult: () => null }))
jest.mock('@/components/results/MetricsGrid', () => ({ MetricsGrid: () => null }))

import ResultsScreen from './results'
beforeEach(() => { jest.clearAllMocks(); mockDownloadAsync.mockResolvedValue({ uri: 'file://cache/capture_video.mp4' }); mockShareAsync.mockResolvedValue(undefined) })

it('downloads then shares the stored video', async () => {
  render(<ResultsScreen />)
  fireEvent.press(screen.getByLabelText('Save or share video'))
  await waitFor(() => expect(mockDownloadAsync).toHaveBeenCalledWith('https://cdn/v.mp4', expect.stringContaining('file://cache/')))
  await waitFor(() => expect(mockShareAsync).toHaveBeenCalledWith(expect.stringContaining('capture_video_9.mp4'), expect.anything()))
})
