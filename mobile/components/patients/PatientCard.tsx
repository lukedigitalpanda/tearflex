import { TouchableOpacity, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { PatientListItem } from '@shared/types/patient';

export function PatientCard({ patient }: { patient: PatientListItem }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      className="bg-white border border-slate-300 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
      onPress={() => router.push(`/patient/${patient.id}`)}
      activeOpacity={0.7}
    >
      <View className="flex-1 mr-3">
        <Text className="font-medium text-slate-900">{patient.full_name}</Text>
        <Text className="text-xs text-slate-600 mt-0.5">
          DOB {new Date(patient.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
      </View>
      <StatusBadge severity={patient.latest_severity} />
    </TouchableOpacity>
  );
}
