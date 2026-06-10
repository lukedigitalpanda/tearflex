import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

describe('ThemeToggle', () => {
  it('renders the theme select trigger', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows Light as the current selection when theme is light', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Light')
  })
})
