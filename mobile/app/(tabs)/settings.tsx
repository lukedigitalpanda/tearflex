import { View, Text } from 'react-native';
import { useMe } from '@/hooks/useAuth';

export default function SettingsScreen() {
  const { data: me } = useMe();
  return (
    <View className="flex-1 bg-slate-50 px-4 pt-14">
      <Text className="text-xl font-bold text-slate-900 mb-2">Settings</Text>
      {me && (
        <View className="bg-white rounded-xl border border-slate-300 p-4">
          <Text className="font-semibold text-slate-900">{me.clinician.practice.name}</Text>
          <Text className="text-sm text-slate-600 mt-0.5">{me.user.first_name} {me.user.last_name}</Text>
          <Text className="text-xs text-slate-400 mt-0.5 capitalize">{me.clinician.role}</Text>
        </View>
      )}
    </View>
  );
}
