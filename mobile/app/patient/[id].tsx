import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePatient, usePatientTrend } from '@/hooks/usePatients';
import { useAssessments } from '@/hooks/useAssessments';
import { useMe } from '@/hooks/useAuth';
import { TrendChart } from '@/components/patients/TrendChart';
import { StatusBadge } from '@/components/common/StatusBadge';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';

export default function PatientProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = Number(id);
  const router = useRouter();

  const { data: patient, isLoading } = usePatient(patientId);
  const { data: trend } = usePatientTrend(patientId);
  const { data: assessments } = useAssessments({ patient: patientId });
  const { data: me } = useMe();

  const thresholds = {
    normal: me?.clinician.practice.nibut_normal_threshold ?? 10,
    borderline: me?.clinician.practice.nibut_borderline_threshold ?? 5,
  };

  if (isLoading || !patient) return (
    <SafeAreaView className="flex-1 bg-slate-50 px-4 pt-4">
      <LoadingState rows={5} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center mb-4 pt-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-2xl font-bold text-slate-900">{patient.full_name}</Text>
        <View className="flex-row items-center mt-1 gap-3">
          <Text className="text-sm text-slate-600">
            DOB {patient.date_of_birth} · {patient.nhs_number || 'No NHS number'}
          </Text>
          <StatusBadge severity={patient.latest_severity} />
        </View>

        {/* NIBUT trend card */}
        <View className="bg-white border border-slate-300 rounded-xl p-4 mt-4">
          <Text className="font-semibold text-slate-900 mb-3">NIBUT trend</Text>
          <TrendChart
            data={trend ?? []}
            normal={thresholds.normal}
            borderline={thresholds.borderline}
          />
        </View>

        {/* New assessment button */}
        <TouchableOpacity
          className="bg-teal-600 rounded-xl py-3 items-center mt-4"
          activeOpacity={0.8}
          onPress={() =>
            router.push({ pathname: '/assessment/select-test', params: { patientId: id } })
          }
        >
          <Text className="text-white font-semibold text-base">New assessment</Text>
        </TouchableOpacity>

        {/* Assessment history */}
        <View className="bg-white border border-slate-300 rounded-xl p-4 mt-4 mb-8">
          <Text className="font-semibold text-slate-900 mb-3">Assessments</Text>
          {(assessments?.results.length ?? 0) === 0 ? (
            <EmptyState title="No assessments yet" />
          ) : (
            assessments!.results.map((a) => (
              <TouchableOpacity
                key={a.id}
                className="flex-row items-center justify-between border border-slate-200 rounded-lg px-3 py-2 mb-2"
                onPress={() =>
                  router.push({ pathname: '/assessment/results', params: { captureId: String(a.id) } })
                }
              >
                <Text className="text-sm text-slate-900 capitalize">
                  {a.eye} eye · {new Date(a.assessed_at).toLocaleDateString('en-GB')}
                </Text>
                <Text className="text-xs text-slate-500 capitalize">{a.status}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
