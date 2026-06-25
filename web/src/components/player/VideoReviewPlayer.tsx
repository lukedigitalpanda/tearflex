'use client'

import * as React from 'react'
import { Camera, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlaybackControls } from './PlaybackControls'
import { SpeedSlider } from './SpeedSlider'
import { ScrubBar } from './ScrubBar'
import { FrameStep } from './FrameStep'
import { useVideoFrame, type CapturedFrame } from './useVideoFrame'
import { DEFAULT_FPS } from './constants'
import { clampTime } from './player-logic'

export interface VideoReviewPlayerProps {
  source: string
  mode?: 'review' | 'compact'
  fps?: number
  initialRate?: number
  initiallyLooping?: boolean
  onCaptureFrame?: (frame: CapturedFrame) => void
  onExpand?: () => void
  onReady?: (meta: { durationSeconds: number; width: number; height: number }) => void
  onError?: (error: Error) => void
}

export function VideoReviewPlayer({
  source,
  mode = 'review',
  fps = DEFAULT_FPS,
  initialRate = 1,
  initiallyLooping = true,
  onCaptureFrame,
  onExpand,
  onReady,
  onError,
}: VideoReviewPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [ended, setEnded] = React.useState(false)
  const [looping, setLooping] = React.useState(initiallyLooping)
  const [speed, setSpeed] = React.useState(initialRate)
  const [current, setCurrent] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [errored, setErrored] = React.useState(false)
  const captureFrame = useVideoFrame(videoRef)

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  const handlePlayPause = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const handleReplay = () => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    setEnded(false)
    void v.play()
  }

  const seek = (t: number) => {
    const v = videoRef.current
    if (!v) return
    const ct = clampTime(t, duration)
    v.currentTime = ct
    setCurrent(ct)
    if (ended && ct < duration) setEnded(false)
  }

  const handleCapture = async () => {
    if (!onCaptureFrame) return
    try {
      const frame = await captureFrame()
      if (frame) onCaptureFrame(frame)
    } catch {
      // non-fatal; ignore
    }
  }

  if (errored) {
    return (
      <div role="alert" className="rounded-md bg-slate-50 p-6 text-sm text-slate-600">
        Couldn&apos;t load this video
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', mode === 'compact' ? 'max-w-xs' : 'w-full')}>
      <video
        ref={videoRef}
        src={source}
        loop={looping}
        playsInline
        className="w-full rounded-md bg-black"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          v.playbackRate = speed
          setDuration(v.duration)
          onReady?.({ durationSeconds: v.duration, width: v.videoWidth, height: v.videoHeight })
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (!looping) {
            setPlaying(false)
            setEnded(true)
          }
        }}
        onError={() => {
          setErrored(true)
          onError?.(new Error('video load error'))
        }}
      />

      {duration > 0 && <ScrubBar current={current} duration={duration} onSeek={seek} />}

      <div className="flex items-center justify-between gap-2">
        <PlaybackControls
          playing={playing}
          ended={ended}
          looping={looping}
          showLoop={mode === 'review'}
          onPlayPause={handlePlayPause}
          onReplay={handleReplay}
          onToggleLoop={() => setLooping((l) => !l)}
        />

        {mode === 'review' ? (
          <div className="flex items-center gap-3">
            <FrameStep current={current} fps={fps} duration={duration} onSeek={seek} />
            <SpeedSlider speed={speed} onSpeedChange={setSpeed} />
            <button
              type="button"
              aria-label="Capture frame"
              onClick={handleCapture}
              className="rounded p-1 hover:bg-slate-100"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button type="button" aria-label="Expand" onClick={onExpand} className="rounded p-1 hover:bg-slate-100">
            <Maximize2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
