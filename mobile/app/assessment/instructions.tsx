import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TestType } from '@shared/types/assessment';

const INSTRUCTIONS: Record<TestType | 'topography', { title: string; steps: string[] }> = {
  nibut: {
    title: 'NIBUT Capture',
    steps: [
      'Ensure the Placido disc attachment is firmly clipped onto the rear camera.',
      'Position the patient with their chin on the rest if available.',
      'Ask the patient to blink twice slowly, then hold their eye wide open.',
      'Hold the phone with the Placido disc 3–5 cm from the eye.',
      'Tap record when the rings are clearly visible on the cornea.',
    ],
  },
  fluorescein: {
    title: 'Fluorescein Capture',
    steps: [
      'Instil one drop of fluorescein into the lower fornix.',
      'Ask the patient to blink twice to spread the dye.',
      'Wait 30 seconds for the dye to equilibrate.',
      'Apply the blue light filter and position the phone.',
      'Tap record when you can see the fluorescein pattern clearly.',
    ],
  },
  lipid: {
    title: 'Lipid Layer Capture',
    steps: [
      'Position the specular reflection light source at the correct angle.',
      'Ask the patient to look straight ahead at a fixed target.',
      'Adjust position until you can see interference colour fringes.',
      'Ensure the patient does not blink during capture.',
      'Tap record when the lipid pattern is stable and in focus.',
    ],
  },
  topography: {
    title: 'Corneal Topography Capture',
    steps: [
      'Ensure the Placido disc attachment is firmly clipped onto the rear camera.',
      'Ask the patient to look directly at the central dot and open the eye wide.',
      'Hold the phone steady so the rings are sharp and centred on the cornea.',
      'Tap capture — a short video and a burst of still photos are taken together.',
      'Keep still for the one to two seconds of capture.',
    ],
  },
};

export default function InstructionsScreen() {
  const { assessmentId, testType } = useLocalSearchParams<{
    assessmentId: string;
    testType: TestType | 'topography';
  }>();
  const router = useRouter();
  const safeType = testType in INSTRUCTIONS ? testType : ('nibut' as TestType);
  const instructions = INSTRUCTIONS[safeType];

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center pt-4 mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">{instructions.title}</Text>
        </View>

        <Text className="text-sm font-semibold text-slate-600 uppercase mb-4 tracking-wide">
          Before you begin
        </Text>

        {instructions.steps.map((step, i) => (
          <View key={i} className="flex-row mb-4">
            <View className="w-7 h-7 rounded-full bg-teal-600 items-center justify-center mr-3 mt-0.5 shrink-0">
              <Text className="text-white text-xs font-bold">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-slate-700 text-base leading-relaxed">{step}</Text>
          </View>
        ))}

        <TouchableOpacity
          className="bg-coral-500 rounded-xl py-4 items-center mt-6 mb-8"
          activeOpacity={0.8}
          onPress={() =>
            router.push(
              safeType === 'topography'
                ? { pathname: '/assessment/topography-capture', params: { assessmentId } }
                : { pathname: '/assessment/capture', params: { assessmentId, testType } },
            )
          }
        >
          <Text className="text-white font-semibold text-base">I'm ready — start capture</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
