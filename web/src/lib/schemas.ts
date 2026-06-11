import { z } from 'zod'
import { isValidPhoneNumber } from 'libphonenumber-js'

export const loginSchema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const patientSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  date_of_birth: z.string().min(1, 'Required').refine(
    (v) => new Date(v) <= new Date(),
    'Date of birth cannot be in the future',
  ),
  sex: z.enum(['M', 'F', 'O'], { error: (iss) => ({ message: (iss as { input?: unknown }).input === '' ? 'Sex is required' : 'Invalid sex value' }) }),
  email: z.string().email('Enter a valid email address').min(1, 'Email is required'),
  phone: z.string().min(1, 'Phone is required').refine(
    (v) => isValidPhoneNumber(v),
    'Enter a valid phone number',
  ),
  nhs_number: z.string().min(1, 'NHS number is required'),
  notes: z.string().optional(),
})
export type PatientInput = z.infer<typeof patientSchema>

export const thresholdSchema = z.object({
  nibut_normal_threshold: z.coerce.number().positive(),
  nibut_borderline_threshold: z.coerce.number().positive(),
}).refine((v) => v.nibut_normal_threshold > v.nibut_borderline_threshold, {
  message: 'Normal threshold must be greater than the borderline threshold.',
  path: ['nibut_normal_threshold'],
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((v) => v.password === v.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const inviteSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  role: z.enum(['admin', 'clinician', 'technician']),
})
export type InviteInput = z.infer<typeof inviteSchema>

// ─── Assessment creation stepper schemas ───────────────────────────────────

const optPosNum = (max = 60) =>
  z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').max(max, `Max ${max} seconds`).optional(),
  )

export const eyeStepSchema = z.object({
  eye: z.enum(['left', 'right'] as const),
})
export type EyeStepData = z.infer<typeof eyeStepSchema>

export const nibutStepSchema = z.object({
  nibut_first_breakup_seconds: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').max(60, 'Max 60 seconds'),
  ),
  nibut_mean_breakup_seconds: optPosNum(),
})
export type NibutStepData = z.infer<typeof nibutStepSchema>

export interface NibutThresholds {
  normal: number     // >= normal → green
  borderline: number // >= borderline → amber; < borderline → red
}

export function nibutBand(
  value: number | null,
  thresholds: NibutThresholds,
): { label: string; color: string } {
  if (value === null) return { label: '', color: '' }
  if (value >= thresholds.normal) return { label: 'Normal', color: '#4ADE80' }
  if (value >= thresholds.borderline) return { label: 'Borderline', color: '#FBBF24' }
  return { label: 'Concern', color: '#F87171' }
}

export const fluoresceinStepSchema = z.object({
  fluorescein_grade: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().int().min(0, 'Min 0').max(5, 'Max 5').optional(),
  ),
  fluorescein_breakup_seconds: optPosNum(),
})
export type FluoresceinStepData = z.infer<typeof fluoresceinStepSchema>

export const lipidStepSchema = z.object({
  lipid_grade: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().int().min(1, 'Min 1').max(5, 'Max 5').optional(),
  ),
  lipid_thickness_nm: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').optional(),
  ),
  tear_meniscus_height_mm: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').optional(),
  ),
})
export type LipidStepData = z.infer<typeof lipidStepSchema>
