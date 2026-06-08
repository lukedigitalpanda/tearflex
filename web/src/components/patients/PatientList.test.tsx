import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PatientList } from './PatientList'

const patients = [
  { id: 1, first_name: 'Jane', last_name: 'Doe', full_name: 'Jane Doe', date_of_birth: '1980-01-01', latest_severity: 'mild', updated_at: '2026-06-01T10:00:00Z' },
  { id: 2, first_name: 'John', last_name: 'Roe', full_name: 'John Roe', date_of_birth: '1975-05-05', latest_severity: null, updated_at: '2026-06-02T10:00:00Z' },
]

describe('PatientList', () => {
  it('renders a row per patient', () => {
    render(<PatientList patients={patients as never} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('John Roe')).toBeInTheDocument()
  })
})
