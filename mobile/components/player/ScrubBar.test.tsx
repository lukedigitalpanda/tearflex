import { render, screen, fireEvent } from '@testing-library/react-native'
import { ScrubBar } from './ScrubBar'

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: any) => <View testID="slider" {...props} />,
  }
})

describe('ScrubBar', () => {
  it('renders the current / duration timestamp', () => {
    render(<ScrubBar current={7} duration={67} onSeek={() => {}} />)
    expect(screen.getByText('0:07 / 1:07')).toBeOnTheScreen()
  })

  it('calls onSeek with a clamped value on slide complete', () => {
    const onSeek = jest.fn()
    render(<ScrubBar current={0} duration={10} onSeek={onSeek} />)
    fireEvent(screen.getByTestId('slider'), 'onSlidingComplete', 25)
    expect(onSeek).toHaveBeenCalledWith(10)
  })

  it('uses max 0 when duration is not positive', () => {
    render(<ScrubBar current={0} duration={0} onSeek={() => {}} />)
    expect(screen.getByTestId('slider').props.maximumValue).toBe(0)
  })
})
