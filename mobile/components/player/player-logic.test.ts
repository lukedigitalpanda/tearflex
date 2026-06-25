import { clampTime, formatTimestamp, frameStepDelta, SPEED_STEPS } from './player-logic'

describe('player-logic', () => {
  describe('clampTime', () => {
    it('clamps into [0, duration]', () => {
      expect(clampTime(-2, 10)).toBe(0)
      expect(clampTime(5, 10)).toBe(5)
      expect(clampTime(20, 10)).toBe(10)
    })
    it('guards NaN/non-finite to 0', () => {
      expect(clampTime(NaN, 10)).toBe(0)
      expect(clampTime(5, NaN)).toBe(0)
      expect(clampTime(Infinity, 10)).toBe(10)
    })
  })

  describe('formatTimestamp', () => {
    it('formats as M:SS with zero-padded seconds', () => {
      expect(formatTimestamp(0)).toBe('0:00')
      expect(formatTimestamp(7)).toBe('0:07')
      expect(formatTimestamp(67)).toBe('1:07')
    })
    it('guards NaN to 0:00', () => {
      expect(formatTimestamp(NaN)).toBe('0:00')
    })
  })

  describe('frameStepDelta', () => {
    it('returns 1/fps', () => {
      expect(frameStepDelta(30)).toBeCloseTo(1 / 30)
      expect(frameStepDelta(60)).toBeCloseTo(1 / 60)
    })
    it('falls back to 1/30 for fps <= 0 or non-finite', () => {
      expect(frameStepDelta(0)).toBeCloseTo(1 / 30)
      expect(frameStepDelta(-5)).toBeCloseTo(1 / 30)
      expect(frameStepDelta(NaN)).toBeCloseTo(1 / 30)
    })
  })

  it('SPEED_STEPS is slow-only fastest→slowest', () => {
    expect(SPEED_STEPS).toEqual([1, 0.75, 0.5, 0.25, 0.1])
  })
})
