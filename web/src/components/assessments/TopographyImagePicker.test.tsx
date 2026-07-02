import { describe, it, expect, vi, beforeAll } from 'vitest'
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
})
