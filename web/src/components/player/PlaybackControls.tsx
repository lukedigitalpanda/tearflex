'use client'

import { Play, Pause, RotateCcw, Repeat } from 'lucide-react'

export function PlaybackControls({
  playing,
  ended,
  looping,
  showLoop = true,
  onPlayPause,
  onReplay,
  onToggleLoop,
}: {
  playing: boolean
  ended: boolean
  looping: boolean
  showLoop?: boolean
  onPlayPause: () => void
  onReplay: () => void
  onToggleLoop: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {ended ? (
        <button type="button" aria-label="Play again" onClick={onReplay} className="rounded p-1 hover:bg-slate-100">
          <RotateCcw className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={onPlayPause}
          className="rounded p-1 hover:bg-slate-100"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
      )}
      {showLoop && (
        <button
          type="button"
          aria-label="Toggle loop"
          aria-pressed={looping}
          onClick={onToggleLoop}
          className={looping ? 'rounded p-1 text-teal-600' : 'rounded p-1 text-slate-400'}
        >
          <Repeat className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
