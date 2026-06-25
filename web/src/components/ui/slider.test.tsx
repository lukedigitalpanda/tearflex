import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Slider } from './slider'

describe('Slider', () => {
  it('renders a slider thumb with the provided aria-label', () => {
    render(<Slider aria-label="Test slider" min={0} max={4} step={1} value={[2]} />)
    expect(screen.getByRole('slider', { name: 'Test slider' })).toBeInTheDocument()
  })
})
