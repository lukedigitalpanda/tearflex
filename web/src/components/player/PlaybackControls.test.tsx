import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaybackControls } from './PlaybackControls'

const base = {
  playing: false,
  ended: false,
  looping: true,
  onPlayPause: vi.fn(),
  onReplay: vi.fn(),
  onToggleLoop: vi.fn(),
}

describe('PlaybackControls', () => {
  it('shows Play when paused and not ended', () => {
    render(<PlaybackControls {...base} />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('shows Pause when playing', () => {
    render(<PlaybackControls {...base} playing />)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('shows Play again when ended and calls onReplay', async () => {
    const onReplay = vi.fn()
    render(<PlaybackControls {...base} ended onReplay={onReplay} />)
    const btn = screen.getByRole('button', { name: 'Play again' })
    await userEvent.click(btn)
    expect(onReplay).toHaveBeenCalledOnce()
  })

  it('reflects loop state with aria-pressed and toggles it', async () => {
    const onToggleLoop = vi.fn()
    render(<PlaybackControls {...base} looping onToggleLoop={onToggleLoop} />)
    const loop = screen.getByRole('button', { name: 'Toggle loop' })
    expect(loop).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(loop)
    expect(onToggleLoop).toHaveBeenCalledOnce()
  })
})
