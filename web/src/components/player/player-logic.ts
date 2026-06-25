import { SPEED_STEPS, DEFAULT_FPS } from './constants'

export function clampTime(t: number, duration: number): number {
  if (!Number.isFinite(t) || t < 0) return 0
  if (Number.isFinite(duration) && t > duration) return duration
  return t
}

export function formatSeconds(seconds: number, decimals = 2): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  return `${s.toFixed(decimals)}s`
}

export function stepFrame(current: number, direction: 1 | -1, fps = DEFAULT_FPS, duration = Infinity): number {
  const safeFps = fps > 0 ? fps : DEFAULT_FPS
  return clampTime(current + direction * (1 / safeFps), duration)
}

export function speedAtIndex(index: number): number {
  const i = Math.min(SPEED_STEPS.length - 1, Math.max(0, Math.round(index)))
  return SPEED_STEPS[i]
}

export function indexOfSpeed(speed: number): number {
  const i = (SPEED_STEPS as readonly number[]).indexOf(speed)
  return i === -1 ? 0 : i
}
