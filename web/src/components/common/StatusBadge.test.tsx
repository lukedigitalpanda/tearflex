import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the severity label', () => {
    render(<StatusBadge severity="moderate" />)
    expect(screen.getByText('Moderate')).toBeInTheDocument()
  })
  it('renders "Not assessed" for null', () => {
    render(<StatusBadge severity={null} />)
    expect(screen.getByText('Not assessed')).toBeInTheDocument()
  })
})
