import { describe, expect, it } from 'vitest'
import { SPEED_STEPS, DEFAULT_FPS } from './constants'
import { clampTime, formatSeconds, stepFrame, speedAtIndex, indexOfSpeed } from './player-logic'

describe('constants', () => {
  it('exposes the exact slow-mo steps and default fps', () => {
    expect(SPEED_STEPS).toEqual([1, 0.75, 0.5, 0.25, 0.1])
    expect(DEFAULT_FPS).toBe(30)
  })
})

describe('clampTime', () => {
  it('clamps below 0 to 0', () => expect(clampTime(-3, 25)).toBe(0))
  it('clamps above duration to duration', () => expect(clampTime(30, 25)).toBe(25))
  it('passes values inside the range', () => expect(clampTime(8.2, 25)).toBe(8.2))
  it('treats NaN as 0', () => expect(clampTime(NaN, 25)).toBe(0))
  it('does not clamp to a non-finite duration', () => expect(clampTime(8.2, Infinity)).toBe(8.2))
})

describe('formatSeconds', () => {
  it('formats current time to 2 decimals by default', () => expect(formatSeconds(8.2)).toBe('8.20s'))
  it('formats duration to 1 decimal when asked', () => expect(formatSeconds(25, 1)).toBe('25.0s'))
  it('guards NaN to zero', () => expect(formatSeconds(NaN)).toBe('0.00s'))
  it('guards negatives to zero', () => expect(formatSeconds(-4, 1)).toBe('0.0s'))
})

describe('stepFrame', () => {
  it('advances one frame at 30fps', () => expect(stepFrame(1, 1, 30, 25)).toBeCloseTo(1 + 1 / 30, 5))
  it('retreats one frame at 30fps', () => expect(stepFrame(1, -1, 30, 25)).toBeCloseTo(1 - 1 / 30, 5))
  it('falls back to 30fps when fps is 0/unknown', () => expect(stepFrame(1, 1, 0, 25)).toBeCloseTo(1 + 1 / 30, 5))
  it('clamps at the end', () => expect(stepFrame(25, 1, 30, 25)).toBe(25))
  it('clamps at the start', () => expect(stepFrame(0, -1, 30, 25)).toBe(0))
})

describe('speed index mapping', () => {
  it('maps index to speed', () => {
    expect(speedAtIndex(0)).toBe(1)
    expect(speedAtIndex(4)).toBe(0.1)
  })
  it('rounds and clamps out-of-range indices', () => {
    expect(speedAtIndex(-2)).toBe(1)
    expect(speedAtIndex(99)).toBe(0.1)
    expect(speedAtIndex(1.4)).toBe(0.75)
  })
  it('maps speed back to index', () => {
    expect(indexOfSpeed(1)).toBe(0)
    expect(indexOfSpeed(0.1)).toBe(4)
  })
  it('returns index 0 for an unknown speed', () => expect(indexOfSpeed(0.42)).toBe(0))
})
