import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManageClinicianDialog } from './ManageClinicianDialog'

vi.mock('@/hooks/usePractice', () => ({
  useUpdateClinician: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveClinician: () => ({ mutate: vi.fn(), isPending: false }),
  usePractices: () => ({ data: [{ id: 1, name: 'Home' }, { id: 2, name: 'Sibling' }] }),
}))
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { user: { is_superuser: false }, clinician: { role: 'chain_admin' } } }),
}))

const clinician = {
  id: 9, role: 'clinician', title: '', professional_registration: '',
  user: { first_name: 'Jo', last_name: 'Bloggs', email: 'jo@x.com' },
  practice: { id: 1, name: 'Home' },
} as never

describe('ManageClinicianDialog (chain admin)', () => {
  it('offers manageable roles and the move dropdown', async () => {
    render(<ManageClinicianDialog clinician={clinician} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    // role options limited to admin/clinician/technician (no chain_admin)
    expect(screen.getByRole('option', { name: 'Practice Admin' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Chain Admin' })).not.toBeInTheDocument()
    // move dropdown lists the chain's practices
    expect(screen.getByRole('option', { name: 'Sibling' })).toBeInTheDocument()
  })
})
