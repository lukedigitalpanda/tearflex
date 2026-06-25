import { render, screen, fireEvent } from '@testing-library/react-native'
import { PlaybackControls } from './PlaybackControls'

const base = {
  playing: false, looping: true,
  onPlayPause: jest.fn(), onToggleLoop: jest.fn(),
  onStepBack: jest.fn(), onStepForward: jest.fn(), onCaptureFrame: jest.fn(),
}

describe('PlaybackControls', () => {
  it('wires the core controls', () => {
    const props = { ...base, onPlayPause: jest.fn(), onStepForward: jest.fn(), onCaptureFrame: jest.fn() }
    render(<PlaybackControls {...props} />)
    fireEvent.press(screen.getByLabelText('Play'))
    fireEvent.press(screen.getByLabelText('Next frame'))
    fireEvent.press(screen.getByLabelText('Capture frame'))
    expect(props.onPlayPause).toHaveBeenCalledTimes(1)
    expect(props.onStepForward).toHaveBeenCalledTimes(1)
    expect(props.onCaptureFrame).toHaveBeenCalledTimes(1)
  })

  it('shows Pause when playing', () => {
    render(<PlaybackControls {...base} playing />)
    expect(screen.getByLabelText('Pause')).toBeOnTheScreen()
  })

  it('hides capture and loop when disabled (compact)', () => {
    render(<PlaybackControls {...base} showCapture={false} showLoop={false} />)
    expect(screen.queryByLabelText('Capture frame')).toBeNull()
    expect(screen.queryByLabelText('Toggle loop')).toBeNull()
  })
})
