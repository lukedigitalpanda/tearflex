export { SPEED_STEPS } from './types'
export type { SpeedStep } from './types'

export function clampTime(t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const safe = Number.isFinite(t) ? t : t > 0 ? duration : 0
  return Math.min(Math.max(safe, 0), duration)
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function frameStepDelta(fps: number): number {
  return 1 / (Number.isFinite(fps) && fps > 0 ? fps : 30)
}
