import { TouchableOpacity, View } from 'react-native';
import type { CaptureState } from './AlignmentOverlay';

interface Props {
  state: CaptureState;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function CaptureButton({ state, onStartRecording, onStopRecording }: Props) {
  const isActive = state === 'ALIGNED' || state === 'RECORDING';
  const bgColor =
    state === 'RECORDING' ? '#EF4444' :
    state === 'ALIGNED' ? '#F97066' :
    '#CBD5E1';

  function handlePress() {
    if (state === 'ALIGNED') onStartRecording();
    else if (state === 'RECORDING') onStopRecording();
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={!isActive}
      activeOpacity={0.8}
    >
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: bgColor,
          borderWidth: 4,
          borderColor: 'rgba(255,255,255,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {state === 'RECORDING' ? (
          // Stop icon (square)
          <View style={{ width: 28, height: 28, borderRadius: 5, backgroundColor: 'white' }} />
        ) : (
          // Shutter circle
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'white', opacity: 0.9 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}
