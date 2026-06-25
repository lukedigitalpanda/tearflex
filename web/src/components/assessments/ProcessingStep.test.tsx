import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import * as hooks from '@/hooks/useCaptures'
import { ProcessingStep } from './ProcessingStep'

beforeEach(() => { vi.restoreAllMocks() })

describe('ProcessingStep', () => {
  it('calls onAnalysed when status becomes analysed', async () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'analysed' } } as never)
    const onAnalysed = vi.fn()
    render(<ProcessingStep captureId={9} onAnalysed={onAnalysed} />)
    await waitFor(() => expect(onAnalysed).toHaveBeenCalledOnce())
  })

  it('shows a failure message when status is failed', () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'failed' } } as never)
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} />)
    expect(screen.getByText(/analysis failed/i)).toBeInTheDocument()
  })

  it('shows processing while pending', () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'processing' } } as never)
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} />)
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
  })
})
