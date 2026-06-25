import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as hooks from '@/hooks/useCaptures'
import { ProcessingStep } from './ProcessingStep'

beforeEach(() => { vi.restoreAllMocks() })

describe('ProcessingStep', () => {
  it('calls onAnalysed when status becomes analysed', async () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'analysed' }, isTimedOut: false } as never)
    const onAnalysed = vi.fn()
    render(<ProcessingStep captureId={9} onAnalysed={onAnalysed} onRetry={vi.fn()} />)
    await waitFor(() => expect(onAnalysed).toHaveBeenCalledOnce())
  })

  it('shows a failure message when status is failed', () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'failed' }, isTimedOut: false } as never)
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByText(/analysis failed/i)).toBeInTheDocument()
  })

  it('shows processing while pending', () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'processing' }, isTimedOut: false } as never)
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
  })

  it('failed state: renders Retry button and calls onRetry when clicked', async () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'failed' }, isTimedOut: false } as never)
    const onRetry = vi.fn()
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByText(/analysis failed/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('timed-out state: renders timeout message and Retry button calling onRetry', async () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'processing' }, isTimedOut: true } as never)
    const onRetry = vi.fn()
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
