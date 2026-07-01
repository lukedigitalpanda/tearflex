'use client'

import { Slider } from '@/components/ui/slider'
import { SPEED_STEPS } from './constants'
import { speedAtIndex, indexOfSpeed } from './player-logic'

export function SpeedSlider({
  speed,
  onSpeedChange,
}: {
  speed: number
  onSpeedChange: (s: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Speed</span>
      <Slider
        aria-label="Playback speed"
        min={0}
        max={SPEED_STEPS.length - 1}
        step={1}
        value={[indexOfSpeed(speed)]}
        onValueChange={(v) => onSpeedChange(speedAtIndex(v[0]))}
        className="w-28"
      />
      <span className="w-12 text-right text-xs font-medium tabular-nums">{speed}×</span>
    </div>
  )
}
