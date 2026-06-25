import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeWrapper } from '@/test/queryWrapper'

vi.mock('./UploadAssessmentFlow', () => ({ UploadAssessmentFlow: () => <div data-testid="upload-flow" /> }))

import { NewAssessmentStepper } from './NewAssessmentStepper'

describe('NewAssessmentStepper entry mode', () => {
  it('after eye, choosing Upload shows the upload flow', async () => {
    render(<NewAssessmentStepper patientId={3} />, { wrapper: makeWrapper() })
    // StepEye: choose right eye then continue
    await userEvent.click(screen.getByRole('button', { name: /right eye/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Entry-mode choice appears
    await userEvent.click(screen.getByRole('button', { name: /upload a video/i }))
    expect(screen.getByTestId('upload-flow')).toBeInTheDocument()
  })

  it('after eye, choosing Manual shows the NIBUT step', async () => {
    render(<NewAssessmentStepper patientId={3} />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /right eye/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /enter results manually/i }))
    expect(screen.getByText(/first break-up/i)).toBeInTheDocument()
  })
})
