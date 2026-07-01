import { render, screen, fireEvent } from '@testing-library/react-native'
import { ManualEntry } from './ManualEntry'

it('submits the entered NIBUT first break-up value', () => {
  const onSubmit = jest.fn()
  render(<ManualEntry testType="nibut" onSubmit={onSubmit} onBack={() => {}} />)
  fireEvent.changeText(screen.getByLabelText('First break-up (s)'), '7.2')
  fireEvent.press(screen.getByLabelText('Save'))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nibut_first_breakup_seconds: 7.2 }))
})

it('blocks submit and shows an error when the required field is empty', () => {
  const onSubmit = jest.fn()
  render(<ManualEntry testType="nibut" onSubmit={onSubmit} onBack={() => {}} />)
  fireEvent.press(screen.getByLabelText('Save'))
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByText(/required/i)).toBeOnTheScreen()
})

it('calls onBack', () => {
  const onBack = jest.fn()
  render(<ManualEntry testType="nibut" onSubmit={() => {}} onBack={onBack} />)
  fireEvent.press(screen.getByLabelText('Back'))
  expect(onBack).toHaveBeenCalledTimes(1)
})
