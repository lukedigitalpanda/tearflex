// Keratometric refractive index used to convert corneal radius to power.
export const KERATOMETRIC_INDEX = 1.3375;

// Placeholder pixel-radius -> dioptre scale. Subsystem A (calibration) replaces
// this; absolute dioptre values are NOT metrically valid in slice 1.
export const NOMINAL_DIOPTRE_SCALE = 4300.0;

export const RESEARCH_USE_DISCLAIMER =
  'Research use only — values are uncalibrated and not for diagnosis.';

// Dioptre colour stops for the axial-map legend (cool = flat, warm = steep).
export const DIOPTRE_COLOUR_STOPS: { dioptre: number; colour: string }[] = [
  { dioptre: 38, colour: '#2563EB' },
  { dioptre: 41, colour: '#22D3EE' },
  { dioptre: 43, colour: '#4ADE80' },
  { dioptre: 45, colour: '#FBBF24' },
  { dioptre: 48, colour: '#F87171' },
];
