import { describe, expect, it } from 'vitest'
import { changePasswordSchema, onboardingSchema } from './schemas'

describe('onboardingSchema', () => {
  const base = {
    practice_name: 'C', address_line_1: '1 St', city: 'Leeds', postcode: 'LS1 1AA',
    contact_first_name: 'Jo', contact_last_name: 'B', contact_email: 'jo@x.com',
    password: 'secret123',
  }
  it('accepts valid details', () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true)
  })
  it('rejects a short password', () => {
    expect(onboardingSchema.safeParse({ ...base, password: 'x' }).success).toBe(false)
  })
  it('rejects a missing practice name', () => {
    expect(onboardingSchema.safeParse({ ...base, practice_name: '' }).success).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  it('accepts a valid change', () => {
    const r = changePasswordSchema.safeParse({
      current_password: 'old', new_password: 'newpass456', confirm_password: 'newpass456' })
    expect(r.success).toBe(true)
  })
  it('rejects a too-short new password', () => {
    const r = changePasswordSchema.safeParse({
      current_password: 'old', new_password: 'short', confirm_password: 'short' })
    expect(r.success).toBe(false)
  })
  it('rejects mismatched confirmation', () => {
    const r = changePasswordSchema.safeParse({
      current_password: 'old', new_password: 'newpass456', confirm_password: 'different' })
    expect(r.success).toBe(false)
  })
})
