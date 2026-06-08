import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const patientSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  date_of_birth: z.string().min(1, 'Required'),
  sex: z.enum(['M', 'F', 'O']).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  nhs_number: z.string().optional(),
})
export type PatientInput = z.infer<typeof patientSchema>

export const thresholdSchema = z.object({
  nibut_normal_threshold: z.coerce.number().positive(),
  nibut_borderline_threshold: z.coerce.number().positive(),
})

export const inviteSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  role: z.enum(['admin', 'clinician', 'technician']),
})
export type InviteInput = z.infer<typeof inviteSchema>
