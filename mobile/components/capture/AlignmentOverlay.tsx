import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

export type CaptureState = 'READY' | 'ALIGNING' | 'ALIGNED' | 'RECORDING' | 'COMPLETE';

const SIZE = 260;

export function AlignmentOverlay({ state }: { state: CaptureState }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'ALIGNING') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.25, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => { loop.stop(); pulse.setValue(1); };
    }
    pulse.setValue(1);
  }, [state, pulse]);

  const borderColor =
    state === 'ALIGNED' || state === 'RECORDING'
      ? '#4ADE80'
      : state === 'ALIGNING'
      ? '#0E7C7B'
      : 'rgba(203,213,225,0.6)';

  const bgColor =
    state === 'ALIGNED' || state === 'RECORDING'
      ? 'rgba(74,222,128,0.07)'
      : 'transparent';

  return (
    <View
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -(SIZE / 2),
        marginLeft: -(SIZE / 2),
        width: SIZE,
        height: SIZE,
        pointerEvents: 'none',
      }}
    >
      <Animated.View
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 3,
          borderColor,
          backgroundColor: bgColor,
          opacity: pulse,
        }}
      />
    </View>
  );
}
