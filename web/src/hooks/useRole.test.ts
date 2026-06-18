import { describe, expect, it } from 'vitest'
import { manageableRoles } from './useRole'

const me = (role: string | null, superuser = false) => ({
  user: { is_superuser: superuser },
  clinician: role ? { role } : null,
}) as never

describe('manageableRoles', () => {
  it('superuser manages all roles', () => {
    expect(manageableRoles(me(null, true)).sort()).toEqual(
      ['admin', 'chain_admin', 'clinician', 'technician'])
  })
  it('chain admin manages admin/clinician/technician', () => {
    expect(manageableRoles(me('chain_admin')).sort()).toEqual(
      ['admin', 'clinician', 'technician'])
  })
  it('practice admin manages clinician/technician', () => {
    expect(manageableRoles(me('admin')).sort()).toEqual(['clinician', 'technician'])
  })
  it('technician manages nothing', () => {
    expect(manageableRoles(me('technician'))).toEqual([])
  })
})
