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
  generated_by: number | null
  pdf_file: string | null
  status: 'pending' | 'ready' | 'failed'
  created_at: string
}

export interface ClinicianInviteResult {
  id: number
  email: string
  role: string
  token: string
  invite_url: string
}
