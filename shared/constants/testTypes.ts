export const TEST_TYPES = [
  { value: 'nibut', label: 'NIBUT' },
  { value: 'fluorescein', label: 'Fluorescein Break-Up' },
  { value: 'lipid', label: 'Lipid Layer' },
] as const

export type TestType = (typeof TEST_TYPES)[number]['value']
