import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from './page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function renderPage() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><LoginPage /></QueryClientProvider>)
}

describe('LoginPage', () => {
  it('renders username, password, and submit', () => {
    renderPage()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    // Exact 'Password' so we match the input's label, not the "Show password" toggle button.
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
