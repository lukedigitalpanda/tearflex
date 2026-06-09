import { View, Text, StyleSheet } from 'react-native';
import { severityColour, severityLabel, type Severity } from '@/constants/colours';

interface NIBUTResultProps {
  firstBreakup: number | null;
  meanBreakup: number | null;
  severity: Severity | null;
}

export function NIBUTResult({ firstBreakup, meanBreakup, severity }: NIBUTResultProps) {
  const bgColour = severityColour(severity);
  const noData = firstBreakup == null && meanBreakup == null;

  return (
    <View style={[styles.card, { backgroundColor: bgColour }]}>
      {noData ? (
        <Text style={styles.noResult}>No result</Text>
      ) : (
        <>
          <View style={styles.topRow}>
            <View>
              <View style={styles.valueRow}>
                <Text style={styles.value}>{firstBreakup?.toFixed(1) ?? '—'}</Text>
                <Text style={styles.unit}>s</Text>
              </View>
              <Text style={styles.subLabel}>First break-up time</Text>
            </View>
            <View style={[styles.badge, { borderColor: bgColour }]}>
              <Text style={[styles.badgeText, { color: bgColour }]}>{severityLabel(severity)}</Text>
            </View>
          </View>
          <Text style={styles.mean}>
            Mean: {meanBreakup?.toFixed(1) ?? '—'}s
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 56,
  },
  unit: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
    marginLeft: 4,
  },
  subLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginTop: 2,
  },
  mean: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.80)',
    marginTop: 12,
  },
  badge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  noResult: {
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '500',
    paddingVertical: 16,
  },
});
