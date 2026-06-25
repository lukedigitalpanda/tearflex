import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateAssessment } from '@/hooks/useAssessments';
import type { Eye, TestType } from '@shared/types/assessment';

const EYES: { value: Eye; label: string }[] = [
  { value: 'right', label: 'Right Eye' },
  { value: 'left', label: 'Left Eye' },
];

const TEST_TYPES: { value: TestType; label: string; description: string }[] = [
  { value: 'nibut', label: 'NIBUT', description: 'Non-invasive tear break-up time via Placido rings' },
  { value: 'fluorescein', label: 'Fluorescein', description: 'Tear break-up under blue light with dye' },
  { value: 'lipid', label: 'Lipid Layer', description: 'Interference pattern lipid thickness grading' },
];

export default function SelectTestScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();
  const createAssessment = useCreateAssessment();

  const [selectedEye, setSelectedEye] = useState<Eye | null>(null);
  const [selectedTest, setSelectedTest] = useState<TestType | null>(null);

  async function handleStart() {
    if (!selectedEye || !selectedTest || !patientId) return;
    try {
      const assessment = await createAssessment.mutateAsync({
        patient: Number(patientId),
        eye: selectedEye,
      });
      router.push({
        pathname: '/assessment/acquire',
        params: { assessmentId: String(assessment.id), testType: selectedTest },
      });
    } catch {
      // error is surfaced via createAssessment.isError
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center pt-4 mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">New Assessment</Text>
        </View>

        {/* Eye selection */}
        <Text className="text-sm font-semibold text-slate-600 uppercase mb-2 tracking-wide">
          Which eye?
        </Text>
        <View className="flex-row gap-3 mb-6">
          {EYES.map((eye) => (
            <TouchableOpacity
              key={eye.value}
              className={`flex-1 rounded-xl py-4 items-center border-2 ${
                selectedEye === eye.value
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-slate-300 bg-white'
              }`}
              onPress={() => setSelectedEye(eye.value)}
              activeOpacity={0.8}
            >
              <Text className={`font-semibold text-base ${
                selectedEye === eye.value ? 'text-teal-700' : 'text-slate-700'
              }`}>
                {eye.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Test type selection */}
        <Text className="text-sm font-semibold text-slate-600 uppercase mb-2 tracking-wide">
          Test type
        </Text>
        {TEST_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            className={`rounded-xl p-4 mb-3 border-2 ${
              selectedTest === t.value
                ? 'border-teal-600 bg-teal-50'
                : 'border-slate-300 bg-white'
            }`}
            onPress={() => setSelectedTest(t.value)}
            activeOpacity={0.8}
          >
            <Text className={`font-semibold text-base mb-0.5 ${
              selectedTest === t.value ? 'text-teal-700' : 'text-slate-900'
            }`}>
              {t.label}
            </Text>
            <Text className="text-sm text-slate-600">{t.description}</Text>
          </TouchableOpacity>
        ))}

        {createAssessment.isError && (
          <Text className="text-status-severe text-sm mt-2">
            Could not create assessment. Please try again.
          </Text>
        )}

        {/* Start button */}
        <TouchableOpacity
          className={`rounded-xl py-4 items-center mt-4 mb-8 ${
            selectedEye && selectedTest ? 'bg-teal-600' : 'bg-slate-300'
          }`}
          onPress={handleStart}
          disabled={!selectedEye || !selectedTest || createAssessment.isPending}
          activeOpacity={0.8}
        >
          {createAssessment.isPending
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Continue</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
