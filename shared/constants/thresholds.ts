export const NIBUT_THRESHOLDS = {
  normal: 10,      // >= 10 seconds = normal (green)
  borderline: 5,   // 5-9.9 seconds = borderline (amber)
  // < 5 seconds = concern (red) - TFOS DEWS II diagnostic cutoff
} as const;

export const FLUORESCEIN_GRADES: Record<number, string> = {
  0: 'Absent',
  1: 'Minimal',
  2: 'Mild',
  3: 'Moderate',
  4: 'Marked',
  5: 'Severe',
};

export const LIPID_GRADES: Record<number, string> = {
  1: 'Open meshwork (~15nm)',
  2: 'Closed meshwork (~30nm)',
  3: 'Wave / flow (~60nm)',
  4: 'Amorphous (~80nm)',
  5: 'Coloured fringes (>90nm)',
};

export const SEVERITY_COLOURS = {
  normal: '#4ADE80',
  mild: '#FBBF24',
  moderate: '#FB923C',
  severe: '#F87171',
} as const;

export const SEVERITY_LABELS: Record<string, string> = {
  normal: 'Normal',
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};
