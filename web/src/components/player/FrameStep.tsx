'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { stepFrame } from './player-logic'

export function FrameStep({
  current,
  fps,
  duration,
  onSeek,
}: {
  current: number
  fps: number
  duration: number
  onSeek: (t: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous frame"
        onClick={() => onSeek(stepFrame(current, -1, fps, duration))}
        className="rounded p-1 hover:bg-slate-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Next frame"
        onClick={() => onSeek(stepFrame(current, 1, fps, duration))}
        className="rounded p-1 hover:bg-slate-100"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
