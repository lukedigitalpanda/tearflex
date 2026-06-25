import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadReviewStep } from './UploadReviewStep'

vi.mock('@/components/player/VideoReviewPlayer', () => ({
  VideoReviewPlayer: ({ source }: { source: string }) => <div data-testid="player">{source}</div>,
}))

describe('UploadReviewStep', () => {
  it('renders the player on the given source', () => {
    render(<UploadReviewStep src="blob:abc" onCaptureFrame={vi.fn()} onAuto={vi.fn()} onManual={vi.fn()} />)
    expect(screen.getByTestId('player')).toHaveTextContent('blob:abc')
  })

  it('wires the auto and manual actions', async () => {
    const onAuto = vi.fn(); const onManual = vi.fn()
    render(<UploadReviewStep src="blob:abc" onCaptureFrame={vi.fn()} onAuto={onAuto} onManual={onManual} />)
    await userEvent.click(screen.getByRole('button', { name: /auto-analyse/i }))
    await userEvent.click(screen.getByRole('button', { name: /enter manually/i }))
    expect(onAuto).toHaveBeenCalledOnce()
    expect(onManual).toHaveBeenCalledOnce()
  })

  it('disables actions when busy', () => {
    render(<UploadReviewStep src="blob:abc" onCaptureFrame={vi.fn()} onAuto={vi.fn()} onManual={vi.fn()} busy />)
    expect(screen.getByRole('button', { name: /auto-analyse/i })).toBeDisabled()
  })
})
