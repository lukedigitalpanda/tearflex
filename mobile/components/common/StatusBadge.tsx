import { View, Text } from 'react-native';
import { severityColour, severityLabel, type Severity } from '@/constants/colours';

export function StatusBadge({ severity }: { severity: Severity | null | undefined }) {
  const color = severityColour(severity);
  const label = severityLabel(severity);
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${color}22`,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
      gap: 6,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: '500', color }}>{label}</Text>
    </View>
  );
}
