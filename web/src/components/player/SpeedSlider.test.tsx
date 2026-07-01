import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpeedSlider } from './SpeedSlider'

describe('SpeedSlider', () => {
  it('renders the current speed label', () => {
    render(<SpeedSlider speed={0.25} onSpeedChange={vi.fn()} />)
    expect(screen.getByText('0.25×')).toBeInTheDocument()
  })

  it('exposes a labelled speed slider positioned at the current speed index', () => {
    render(<SpeedSlider speed={0.5} onSpeedChange={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: 'Playback speed' })
    // 0.5 is index 2 in SPEED_STEPS
    expect(slider).toHaveAttribute('aria-valuenow', '2')
  })
})
