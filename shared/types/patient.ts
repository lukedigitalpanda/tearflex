export interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  sex: 'M' | 'F' | 'O' | '';
  email: string;
  phone: string;
  nhs_number: string;
  notes: string;
  is_active: boolean;
  latest_severity: DryEyeSeverity | null;
  created_at: string;
  updated_at: string;
}

export type DryEyeSeverity = 'normal' | 'mild' | 'moderate' | 'severe';

export interface PatientListItem {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  latest_severity: DryEyeSeverity | null;
  updated_at: string;
}
