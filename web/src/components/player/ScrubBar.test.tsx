import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrubBar } from './ScrubBar'

describe('ScrubBar', () => {
  it('renders the current time (2dp) over duration (1dp)', () => {
    render(<ScrubBar current={8.2} duration={25} onSeek={vi.fn()} />)
    expect(screen.getByText('8.20s / 25.0s')).toBeInTheDocument()
  })

  it('renders a labelled seek slider', () => {
    render(<ScrubBar current={8.2} duration={25} onSeek={vi.fn()} />)
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument()
  })
})
