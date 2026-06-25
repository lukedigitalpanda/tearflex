import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadManualEntry } from './UploadManualEntry'

describe('UploadManualEntry', () => {
  it('submits the entered NIBUT first break-up time', async () => {
    const onSubmit = vi.fn()
    render(<UploadManualEntry testType="nibut" onSubmit={onSubmit} onBack={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/first break-up/i), '7.2')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nibut_first_breakup_seconds: 7.2 }))
  })

  it('calls onBack', async () => {
    const onBack = vi.fn()
    render(<UploadManualEntry testType="nibut" onSubmit={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
