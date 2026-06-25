import { render, screen, fireEvent } from '@testing-library/react-native'
import { SpeedSelector } from './SpeedSelector'

describe('SpeedSelector', () => {
  it('renders a pill per speed step', () => {
    render(<SpeedSelector value={1} onChange={() => {}} />)
    expect(screen.getByText('1×')).toBeOnTheScreen()
    expect(screen.getByText('0.1×')).toBeOnTheScreen()
  })

  it('calls onChange with the tapped step', () => {
    const onChange = jest.fn()
    render(<SpeedSelector value={1} onChange={onChange} />)
    fireEvent.press(screen.getByLabelText('Speed 0.25x'))
    expect(onChange).toHaveBeenCalledWith(0.25)
  })

  it('marks the active step selected', () => {
    render(<SpeedSelector value={0.5} onChange={() => {}} />)
    expect(screen.getByLabelText('Speed 0.5x').props.accessibilityState).toMatchObject({ selected: true })
  })
})
