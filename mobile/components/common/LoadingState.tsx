import { View } from 'react-native';

function SkeletonRow({ height = 56 }: { height?: number }) {
  return (
    <View style={{ height, backgroundColor: '#E2E8F0', borderRadius: 8, marginBottom: 8 }} />
  );
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <View className="px-0">
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </View>
  );
}
