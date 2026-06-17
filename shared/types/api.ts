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
  eye: 'left' | 'right'
  assessed_at: string
  generated_by: number | null
  status: 'pending' | 'ready' | 'failed'
  generation_attempts: number
  created_at: string
}

export interface ClinicianInviteResult {
  id: number
  email: string
  role: string
  token: string
  invite_url: string
}
