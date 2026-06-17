export type ClinicianRole = 'chain_admin' | 'admin' | 'clinician' | 'technician'

export interface Practice {
  id: number
  name: string
  address_line_1: string
  address_line_2: string
  city: string
  postcode: string
  phone: string
  email: string
  is_active: boolean
  nibut_normal_threshold: number
  nibut_borderline_threshold: number
}

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_superuser: boolean
}

export interface Clinician {
  id: number
  user: User
  practice: Practice
  title: string
  professional_registration: string
  role: ClinicianRole
  created_at: string
}

export interface Me {
  user: User
  clinician: Clinician
}
