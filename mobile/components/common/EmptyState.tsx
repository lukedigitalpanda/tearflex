import { View, Text } from 'react-native';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="border border-dashed border-slate-300 rounded-xl p-10 items-center">
      <Text className="font-medium text-slate-600 text-center">{title}</Text>
      {hint && <Text className="text-sm text-slate-400 text-center mt-1">{hint}</Text>}
    </View>
  );
}
