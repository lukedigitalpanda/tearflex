import { DIOPTRE_COLOUR_STOPS, RESEARCH_USE_DISCLAIMER } from '@shared/constants/topography'
import type { CalibrationState } from '@shared/types/topography'

export { RESEARCH_USE_DISCLAIMER }

const CALIBRATION_LABELS: Record<CalibrationState, string> = {
  uncalibrated: 'Uncalibrated',
  default: 'Default profile',
  calibrated: 'Calibrated',
}

export function calibrationLabel(state: CalibrationState | '' | null | undefined): string {
  if (state && state in CALIBRATION_LABELS) return CALIBRATION_LABELS[state as CalibrationState]
  return 'Uncalibrated'
}

export function dioptreColour(d: number | null | undefined): string {
  if (d == null) return '#CBD5E1'
  const stops = DIOPTRE_COLOUR_STOPS
  if (d <= stops[0].dioptre) return stops[0].colour
  if (d >= stops[stops.length - 1].dioptre) return stops[stops.length - 1].colour
  for (let i = 0; i < stops.length - 1; i++) {
    if (d >= stops[i].dioptre && d < stops[i + 1].dioptre) return stops[i].colour
  }
  return stops[stops.length - 1].colour
}

export function formatDioptre(d: number | null | undefined): string {
  return d != null ? `${d.toFixed(2)} D` : '—'
}

export function formatAxis(deg: number | null | undefined): string {
  return deg != null ? `${Math.round(deg)}°` : '—'
}
