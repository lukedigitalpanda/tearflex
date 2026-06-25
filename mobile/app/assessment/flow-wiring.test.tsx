import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ patientId: '3' }),
}))
const mockMutateAsync = jest.fn().mockResolvedValue({ id: 55 })
jest.mock('@/hooks/useAssessments', () => ({ useCreateAssessment: () => ({ mutateAsync: mockMutateAsync, isPending: false, isError: false }) }))

import SelectTestScreen from './select-test'
beforeEach(() => { jest.clearAllMocks() })

it('select-test navigates to acquire after creating the assessment', async () => {
  render(<SelectTestScreen />)
  fireEvent.press(screen.getByText('Right Eye'))
  fireEvent.press(screen.getByText('NIBUT'))
  fireEvent.press(screen.getByText('Continue'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/acquire',
    params: expect.objectContaining({ assessmentId: '55', testType: 'nibut' }),
  })))
})
