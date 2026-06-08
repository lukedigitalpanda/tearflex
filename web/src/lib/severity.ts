export type Severity = 'normal' | 'mild' | 'moderate' | 'severe'

const SEVERITY: Record<Severity, { color: string; label: string }> = {
  normal: { color: '#4ADE80', label: 'Normal' },
  mild: { color: '#FBBF24', label: 'Mild' },
  moderate: { color: '#FB923C', label: 'Moderate' },
  severe: { color: '#F87171', label: 'Severe' },
}

export function severityMeta(s: Severity | null | undefined) {
  if (s && s in SEVERITY) return SEVERITY[s]
  return { color: '#CBD5E1', label: 'Not assessed' }
}

export interface NibutThresholds { normal: number; borderline: number }

export function nibutBand(seconds: number | null | undefined, t: NibutThresholds) {
  if (seconds == null) return { key: 'unknown' as const, color: '#CBD5E1', label: 'Not assessed' }
  if (seconds >= t.normal) return { key: 'normal' as const, color: '#4ADE80', label: 'Normal' }
  if (seconds >= t.borderline) return { key: 'borderline' as const, color: '#FBBF24', label: 'Borderline' }
  return { key: 'concern' as const, color: '#F87171', label: 'Concern' }
}
