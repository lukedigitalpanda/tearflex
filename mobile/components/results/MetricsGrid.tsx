import { View, Text, StyleSheet } from 'react-native';

interface MetricItem {
  label: string;
  value: string;
  unit?: string;
}

interface MetricsGridProps {
  items: MetricItem[];
}

export function MetricsGrid({ items }: MetricsGridProps) {
  return (
    <View style={styles.grid}>
      {items.map((item, index) => (
        <View key={index} style={styles.tile}>
          <View style={styles.valueRow}>
            <Text style={styles.value}>{item.value}</Text>
            {item.unit != null && <Text style={styles.unit}>{item.unit}</Text>}
          </View>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  unit: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 4,
    marginBottom: 2,
  },
  label: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
});
