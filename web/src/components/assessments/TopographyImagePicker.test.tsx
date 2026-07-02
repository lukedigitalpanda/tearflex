import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopographyImagePicker } from './TopographyImagePicker'

beforeAll(() => {
  // jsdom lacks object-URL support; previews only need stable unique strings
  let n = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${n++}`),
    revokeObjectURL: vi.fn(),
  })
})

beforeEach(() => {
  ;(URL.createObjectURL as ReturnType<typeof vi.fn>).mockClear()
  ;(URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear()
})

const img = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

describe('TopographyImagePicker', () => {
  it('adds picked images via onChange', async () => {
    const onChange = vi.fn()
    render(<TopographyImagePicker files={[]} onChange={onChange} />)
    await userEvent.upload(screen.getByLabelText(/choose topography images/i), [img('a.jpg'), img('b.jpg')])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('rejects non-image files with an inline error and no onChange', async () => {
    const onChange = vi.fn()
    render(<TopographyImagePicker files={[]} onChange={onChange} />)
    const bad = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByLabelText(/choose topography images/i), [bad], { applyAccept: false })
    expect(await screen.findByText(/image files only/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('enforces the 20-image cap', async () => {
    const onChange = vi.fn()
    const existing = Array.from({ length: 19 }, (_, i) => img(`e${i}.jpg`))
    render(<TopographyImagePicker files={existing} onChange={onChange} />)
    await userEvent.upload(screen.getByLabelText(/add more images/i), [img('x.jpg'), img('y.jpg')])
    expect(await screen.findByText(/at most 20 images/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes an image', async () => {
    const onChange = vi.fn()
    render(<TopographyImagePicker files={[img('a.jpg'), img('b.jpg')]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /remove a\.jpg/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].map((f: File) => f.name)).toEqual(['b.jpg'])
  })

  it('does not regenerate object URLs for already-present images', () => {
    const a = img('a.jpg')
    const b = img('b.jpg')
    const { rerender } = render(<TopographyImagePicker files={[a]} onChange={vi.fn()} />)
    const afterFirst = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.length
    rerender(<TopographyImagePicker files={[a, b]} onChange={vi.fn()} />)
    const afterSecond = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.length
    expect(afterSecond - afterFirst).toBe(1) // only b gets a new URL
    expect(URL.revokeObjectURL).not.toHaveBeenCalled() // a's URL survives
  })

  it('clears a stale error when an image is removed', async () => {
    const files = Array.from({ length: 20 }, (_, i) => img(`e${i}.jpg`))
    render(<TopographyImagePicker files={files} onChange={vi.fn()} />)
    await userEvent.upload(screen.getByLabelText(/add more images/i), [img('x.jpg')])
    expect(await screen.findByText(/at most 20 images/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove e0\.jpg/i }))
    expect(screen.queryByText(/at most 20 images/i)).not.toBeInTheDocument()
  })

  it('survives a StrictMode double-mount with retained files (dev remount safety)', () => {
    const a = img('a.jpg')
    render(
      <StrictMode>
        <TopographyImagePicker files={[a]} onChange={vi.fn()} />
      </StrictMode>,
    )
    const src = screen.getByAltText('a.jpg').getAttribute('src')
    const revoked = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    // the rendered thumbnail must not point at a URL the component revoked
    expect(revoked).not.toContain(src)
  })
})
