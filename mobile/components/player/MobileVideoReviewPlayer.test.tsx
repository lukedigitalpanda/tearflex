import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

// --- mock expo-video with a controllable player ---
const mockPlayer = {
  play: jest.fn(), pause: jest.fn(), seekBy: jest.fn(),
  currentTime: 4, duration: 25, playbackRate: 1, loop: true,
  timeUpdateEventInterval: 0,
}
jest.mock('expo-video', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    useVideoPlayer: (_source: string, setup?: (p: any) => void) => { setup?.(mockPlayer); return mockPlayer },
    VideoView: (props: any) => <View testID="video-view" {...props} />,
  }
})

// --- mock expo-video-thumbnails ---
// Variable name must be mock-prefixed to be accessible inside jest.mock factory
const mockGetThumbnailAsync = jest.fn().mockResolvedValue({ uri: 'file:///still.jpg', width: 1920, height: 1080 })
jest.mock('expo-video-thumbnails', () => ({ __esModule: true, getThumbnailAsync: (...a: any[]) => mockGetThumbnailAsync(...a) }))

import { MobileVideoReviewPlayer } from './MobileVideoReviewPlayer'

beforeEach(() => {
  jest.clearAllMocks()
  mockPlayer.currentTime = 4
  mockPlayer.timeUpdateEventInterval = 0
})

describe('MobileVideoReviewPlayer', () => {
  it('renders the video view on the given source', () => {
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={jest.fn()} />)
    expect(screen.getByTestId('video-view')).toBeOnTheScreen()
  })

  it('enables timeUpdate by setting a non-zero interval (so the scrub bar tracks playback)', () => {
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={jest.fn()} />)
    expect(mockPlayer.timeUpdateEventInterval).toBeGreaterThan(0)
  })

  it('play button plays the player; frame-step seeks by 1/fps', () => {
    render(<MobileVideoReviewPlayer source="file:///v.mp4" fps={25} onCaptureFrame={jest.fn()} />)
    fireEvent.press(screen.getByLabelText('Play'))
    expect(mockPlayer.play).toHaveBeenCalled()
    fireEvent.press(screen.getByLabelText('Next frame'))
    expect(mockPlayer.seekBy).toHaveBeenCalledWith(1 / 25)
    fireEvent.press(screen.getByLabelText('Previous frame'))
    expect(mockPlayer.seekBy).toHaveBeenCalledWith(-1 / 25)
  })

  it('capture-frame pauses, grabs the still, and emits a CapturedFrame', async () => {
    const onCaptureFrame = jest.fn()
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={onCaptureFrame} />)
    fireEvent.press(screen.getByLabelText('Capture frame'))
    await waitFor(() => expect(onCaptureFrame).toHaveBeenCalledWith({
      uri: 'file:///still.jpg', timestampSeconds: 4, width: 1920, height: 1080,
    }))
    expect(mockPlayer.pause).toHaveBeenCalled()
    expect(mockGetThumbnailAsync).toHaveBeenCalledWith('file:///v.mp4', { time: 4000 })
  })

  it('thumbnail failure calls onError and does not emit a frame', async () => {
    mockGetThumbnailAsync.mockRejectedValueOnce(new Error('decode failed'))
    const onCaptureFrame = jest.fn(); const onError = jest.fn()
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={onCaptureFrame} onError={onError} />)
    fireEvent.press(screen.getByLabelText('Capture frame'))
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onCaptureFrame).not.toHaveBeenCalled()
  })

  it('compact mode hides speed + capture and shows Expand', () => {
    const onExpand = jest.fn()
    render(<MobileVideoReviewPlayer source="file:///v.mp4" mode="compact" onCaptureFrame={jest.fn()} onExpand={onExpand} />)
    expect(screen.queryByLabelText('Capture frame')).toBeNull()
    expect(screen.queryByLabelText('Speed 0.5x')).toBeNull()
    fireEvent.press(screen.getByLabelText('Expand'))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})
