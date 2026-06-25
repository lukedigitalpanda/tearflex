import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

describe('jest-expo harness', () => {
  it('renders a basic RN component', () => {
    render(<Text>hello</Text>)
    expect(screen.getByText('hello')).toBeOnTheScreen()
  })
})
