import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VideoFilePicker } from './VideoFilePicker'

function pick(input: HTMLElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('VideoFilePicker', () => {
  it('calls onFile and shows the filename for a video', () => {
    const onFile = vi.fn()
    render(<VideoFilePicker onFile={onFile} />)
    const input = screen.getByLabelText(/choose a video/i)
    pick(input, new File(['x'], 'tearfilm.mp4', { type: 'video/mp4' }))
    expect(onFile).toHaveBeenCalledOnce()
    expect(screen.getByText(/tearfilm.mp4/)).toBeInTheDocument()
  })

  it('rejects a non-video file with an inline error', () => {
    const onFile = vi.fn()
    render(<VideoFilePicker onFile={onFile} />)
    const input = screen.getByLabelText(/choose a video/i)
    pick(input, new File(['x'], 'notes.pdf', { type: 'application/pdf' }))
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByText(/please choose a video file/i)).toBeInTheDocument()
  })
})
