import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FrameStep } from './FrameStep'

describe('FrameStep', () => {
  it('steps forward one frame on next', async () => {
    const onSeek = vi.fn()
    render(<FrameStep current={1} fps={30} duration={25} onSeek={onSeek} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next frame' }))
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(1 + 1 / 30, 5)
  })

  it('steps back one frame on previous', async () => {
    const onSeek = vi.fn()
    render(<FrameStep current={1} fps={30} duration={25} onSeek={onSeek} />)
    await userEvent.click(screen.getByRole('button', { name: 'Previous frame' }))
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(1 - 1 / 30, 5)
  })
})
