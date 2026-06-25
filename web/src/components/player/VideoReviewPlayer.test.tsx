import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VideoReviewPlayer } from './VideoReviewPlayer'

// jsdom lacks media playback methods.
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

// Mock the capture hook so we don't exercise canvas here.
const fakeFrame = { image: new Blob(['x'], { type: 'image/jpeg' }), timestampSeconds: 8.2, width: 3840, height: 2160 }
vi.mock('./useVideoFrame', () => ({
  useVideoFrame: () => vi.fn().mockResolvedValue(fakeFrame),
}))

function getVideo(): HTMLVideoElement {
  // The video is the only media element rendered.
  return document.querySelector('video') as HTMLVideoElement
}

describe('VideoReviewPlayer', () => {
  it('renders a video element pointing at the source', () => {
    render(<VideoReviewPlayer source="blob:abc" />)
    expect(getVideo()).toHaveAttribute('src', 'blob:abc')
  })

  it('review mode shows capture-frame and speed controls', () => {
    render(<VideoReviewPlayer source="blob:abc" mode="review" />)
    expect(screen.getByRole('button', { name: 'Capture frame' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Playback speed' })).toBeInTheDocument()
  })

  it('compact mode hides advanced controls and shows expand', () => {
    const onExpand = vi.fn()
    render(<VideoReviewPlayer source="blob:abc" mode="compact" onExpand={onExpand} />)
    expect(screen.queryByRole('button', { name: 'Capture frame' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Playback speed' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
  })

  it('fires onReady with metadata on loadedMetadata', () => {
    const onReady = vi.fn()
    render(<VideoReviewPlayer source="blob:abc" onReady={onReady} />)
    const video = getVideo()
    Object.defineProperty(video, 'duration', { configurable: true, value: 25 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 3840 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 2160 })
    fireEvent.loadedMetadata(video)
    expect(onReady).toHaveBeenCalledWith({ durationSeconds: 25, width: 3840, height: 2160 })
  })

  it('emits a captured frame when capture-frame is clicked', async () => {
    const onCaptureFrame = vi.fn()
    render(<VideoReviewPlayer source="blob:abc" onCaptureFrame={onCaptureFrame} />)
    await userEvent.click(screen.getByRole('button', { name: 'Capture frame' }))
    expect(onCaptureFrame).toHaveBeenCalledWith(fakeFrame)
  })

  it('shows an error state and calls onError when the video errors', () => {
    const onError = vi.fn()
    render(<VideoReviewPlayer source="bad" onError={onError} />)
    fireEvent.error(getVideo())
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load this video/i)
    expect(onError).toHaveBeenCalledOnce()
  })
})
