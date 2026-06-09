import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe } from '@/hooks/useAuth';
import { colours } from '@/constants/colours';

export default function SettingsScreen() {
  const { data: me, isLoading } = useMe();
  return (
    <SafeAreaView className="flex-1 bg-slate-50 px-4">
      <Text className="text-xl font-bold text-slate-900 mb-2 mt-4">Settings</Text>
      {isLoading ? (
        <ActivityIndicator color={colours.teal600} />
      ) : me ? (
        <View className="bg-white rounded-xl border border-slate-300 p-4">
          <Text className="font-semibold text-slate-900">{me.clinician.practice.name}</Text>
          <Text className="text-sm text-slate-600 mt-0.5">{me.user.first_name} {me.user.last_name}</Text>
          <Text className="text-xs text-slate-400 mt-0.5 capitalize">{me.clinician.role}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
