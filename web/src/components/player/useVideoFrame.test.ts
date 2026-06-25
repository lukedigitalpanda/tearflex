import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVideoFrame } from './useVideoFrame'

afterEach(() => vi.restoreAllMocks())

function makeVideo(): HTMLVideoElement {
  return { videoWidth: 3840, videoHeight: 2160, currentTime: 8.2 } as unknown as HTMLVideoElement
}

describe('useVideoFrame', () => {
  it('returns null when the ref is empty', async () => {
    const { result } = renderHook(() => useVideoFrame({ current: null }))
    await expect(result.current()).resolves.toBeNull()
  })

  it('captures the current frame as a jpeg blob with native dimensions and timestamp', async () => {
    const fakeBlob = new Blob(['x'], { type: 'image/jpeg' })
    const ctx = { drawImage: vi.fn() }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob: (cb: (b: Blob | null) => void) => cb(fakeBlob),
    }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return canvas as unknown as HTMLCanvasElement
      }
      return originalCreateElement(tagName)
    })

    const video = makeVideo()
    const { result } = renderHook(() => useVideoFrame({ current: video }))
    const frame = await result.current()

    expect(canvas.width).toBe(3840)
    expect(canvas.height).toBe(2160)
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 3840, 2160)
    expect(frame).toEqual({ image: fakeBlob, timestampSeconds: 8.2, width: 3840, height: 2160 })
  })
})
