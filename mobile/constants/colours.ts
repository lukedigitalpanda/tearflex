export const colours = {
  teal600: '#0E7C7B',
  teal700: '#0A5E5D',
  teal50: '#EFFEFE',
  slate900: '#0F172A',
  slate600: '#475569',
  slate300: '#CBD5E1',
  slate50: '#F8FAFC',
  coral500: '#F97066',
  statusNormal: '#4ADE80',
  statusMild: '#FBBF24',
  statusModerate: '#FB923C',
  statusSevere: '#F87171',
  statusUnknown: '#CBD5E1',
} as const;

export type Severity = 'normal' | 'mild' | 'moderate' | 'severe';

export function severityColour(s: Severity | null | undefined): string {
  switch (s) {
    case 'normal': return colours.statusNormal;
    case 'mild': return colours.statusMild;
    case 'moderate': return colours.statusModerate;
    case 'severe': return colours.statusSevere;
    default: return colours.statusUnknown;
  }
}

export function severityLabel(s: Severity | null | undefined): string {
  if (!s) return 'Not assessed';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface NibutThresholds { normal: number; borderline: number }

export function nibutColour(seconds: number | null | undefined, t: NibutThresholds): string {
  if (seconds == null) return colours.statusUnknown;
  if (seconds >= t.normal) return colours.statusNormal;
  if (seconds >= t.borderline) return colours.statusMild;
  return colours.statusSevere;
}
