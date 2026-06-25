'use client'

import { Slider } from '@/components/ui/slider'
import { clampTime, formatSeconds } from './player-logic'

export function ScrubBar({
  current,
  duration,
  onSeek,
}: {
  current: number
  duration: number
  onSeek: (t: number) => void
}) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0
  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label="Seek"
        min={0}
        max={max}
        step={0.01}
        value={[clampTime(current, max)]}
        onValueChange={(v) => onSeek(clampTime(v[0], max))}
        className="flex-1"
      />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {formatSeconds(current, 2)} / {formatSeconds(duration, 1)}
      </span>
    </div>
  )
}
