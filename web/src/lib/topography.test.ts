import { describe, expect, it } from 'vitest'
import { dioptreColour, formatDioptre, formatAxis, calibrationLabel } from './topography'

describe('topography display helpers', () => {
  it('maps low dioptres to a cool colour and high to warm', () => {
    expect(dioptreColour(38)).toBe('#2563EB')
    expect(dioptreColour(48)).toBe('#F87171')
  })
  it('returns a neutral colour for null', () => {
    expect(dioptreColour(null)).toBe('#CBD5E1')
  })
  it('formats dioptres and axis, with a dash for null', () => {
    expect(formatDioptre(43.25)).toBe('43.25 D')
    expect(formatDioptre(null)).toBe('—')
    expect(formatAxis(90)).toBe('90°')
  })
  it('labels calibration state, defaulting to Uncalibrated', () => {
    expect(calibrationLabel('uncalibrated')).toBe('Uncalibrated')
    expect(calibrationLabel('')).toBe('Uncalibrated')
  })
})
