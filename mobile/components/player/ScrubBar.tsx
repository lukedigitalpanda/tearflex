import { View, Text, StyleSheet } from 'react-native'
import Slider from '@react-native-community/slider'
import { clampTime, formatTimestamp } from './player-logic'

export function ScrubBar({
  current,
  duration,
  onSeek,
}: {
  current: number
  duration: number
  onSeek: (t: number) => void
}) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0
  return (
    <View style={styles.container}>
      <Slider
        minimumValue={0}
        maximumValue={max}
        value={clampTime(current, max)}
        onSlidingComplete={(v: number) => onSeek(clampTime(v, max))}
        minimumTrackTintColor="#0E7C7B"
        maximumTrackTintColor="#CBD5E1"
      />
      <Text style={styles.timestamp}>
        {formatTimestamp(current)} / {formatTimestamp(duration)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#475569',
    fontVariant: ['tabular-nums'],
  },
})
