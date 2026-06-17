export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiErrorBody {
  detail?: string
  [field: string]: unknown
}

export interface Report {
  id: number
  assessment: number
  patient: number
  patient_name: string
  eye: 'left' | 'right'
  assessed_at: string
  generated_by: number | null
  status: 'pending' | 'ready' | 'failed'
  generation_attempts: number
  created_at: string
  // Completion time, only present for superadmin / practice-admin accounts.
  completed_at?: string | null
  // Soft-delete timestamp, only present for superadmin / practice-admin accounts.
  deleted_at?: string | null
}

export interface ClinicianInviteResult {
  id: number
  email: string
  role: string
  token: string
  invite_url: string
}
