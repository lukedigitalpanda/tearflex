import { View, Pressable, Text, StyleSheet } from 'react-native'

interface Props {
  playing: boolean
  looping: boolean
  onPlayPause: () => void
  onToggleLoop: () => void
  onStepBack: () => void
  onStepForward: () => void
  onCaptureFrame: () => void
  showCapture?: boolean
  showLoop?: boolean
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.btn}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  )
}

export function PlaybackControls({
  playing,
  looping: _looping,
  onPlayPause,
  onToggleLoop,
  onStepBack,
  onStepForward,
  onCaptureFrame,
  showCapture = true,
  showLoop = true,
}: Props) {
  return (
    <View style={styles.row}>
      <Btn label="Previous frame" onPress={onStepBack} />
      <Btn label={playing ? 'Pause' : 'Play'} onPress={onPlayPause} />
      <Btn label="Next frame" onPress={onStepForward} />
      {showLoop && <Btn label="Toggle loop" onPress={onToggleLoop} />}
      {showCapture && <Btn label="Capture frame" onPress={onCaptureFrame} />}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    borderRadius: 6,
    backgroundColor: '#F1F5F9', // slate-100
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155', // slate-700
  },
})
