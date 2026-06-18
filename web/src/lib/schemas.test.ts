import { describe, expect, it } from 'vitest'
import { changePasswordSchema } from './schemas'

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
