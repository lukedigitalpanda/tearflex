import { useCallback } from 'react'
import type { RefObject } from 'react'

export interface CapturedFrame {
  image: Blob
  timestampSeconds: number
  width: number
  height: number
}

export function useVideoFrame(videoRef: RefObject<HTMLVideoElement>) {
  return useCallback(async (): Promise<CapturedFrame | null> => {
    const video = videoRef.current
    if (!video) return null

    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob) return null

    return { image: blob, timestampSeconds: video.currentTime, width, height }
  }, [videoRef])
}
