import { View, Pressable, Text, StyleSheet } from 'react-native'
import { SPEED_STEPS } from './types'

function label(step: number): string {
  return `${step}×`
}

export function SpeedSelector({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <View style={styles.row}>
      {SPEED_STEPS.map((step) => {
        const active = step === value
        return (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityLabel={`Speed ${step}x`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(step)}
            style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
              {label(step)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillActive: {
    backgroundColor: '#0E7C7B', // teal-600
  },
  pillInactive: {
    backgroundColor: '#F1F5F9', // slate-100
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    color: '#FFFFFF',
  },
  labelInactive: {
    color: '#475569', // slate-600
  },
})
