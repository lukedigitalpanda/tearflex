import { describe, expect, it } from 'vitest'
import { severityMeta, nibutBand } from './severity'

describe('severityMeta', () => {
  it('maps each severity to colour + label', () => {
    expect(severityMeta('normal')).toEqual({ color: '#4ADE80', label: 'Normal' })
    expect(severityMeta('severe')).toEqual({ color: '#F87171', label: 'Severe' })
  })
  it('handles null/unknown as "Not assessed"', () => {
    expect(severityMeta(null).label).toBe('Not assessed')
  })
})

describe('nibutBand', () => {
  const thresholds = { normal: 10, borderline: 5 }
  it('>= normal threshold is normal', () => {
    expect(nibutBand(10, thresholds).key).toBe('normal')
  })
  it('between borderline and normal is borderline', () => {
    expect(nibutBand(7, thresholds).key).toBe('borderline')
  })
  it('below borderline is concern', () => {
    expect(nibutBand(3, thresholds).key).toBe('concern')
  })
  it('null returns unknown', () => {
    expect(nibutBand(null, thresholds).key).toBe('unknown')
  })
})
