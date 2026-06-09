import { Text } from 'react-native';
import type { CaptureState } from './AlignmentOverlay';
import type { TestType } from '@shared/types/assessment';

const RECORDING_PROMPTS: Record<TestType, string> = {
  nibut: 'Ask patient to blink twice, then hold eye wide open',
  fluorescein: 'Recording fluorescein break-up…',
  lipid: 'Recording lipid layer…',
};

const STATE_PROMPTS: Partial<Record<CaptureState, string>> = {
  READY: 'Position the Placido disc over the patient\'s eye',
  ALIGNING: 'Hold steady… aligning',
  ALIGNED: 'Aligned. Tap to start recording',
  COMPLETE: '',
};

export function StatePrompt({ state, testType }: { state: CaptureState; testType: TestType }) {
  const text =
    state === 'RECORDING'
      ? RECORDING_PROMPTS[testType]
      : STATE_PROMPTS[state] ?? '';

  return (
    <Text
      style={{
        color: state === 'ALIGNED' || state === 'RECORDING' ? '#4ADE80' : 'rgba(255,255,255,0.9)',
        fontSize: 15,
        fontWeight: '500',
        textAlign: 'center',
        paddingHorizontal: 24,
      }}
    >
      {text}
    </Text>
  );
}
