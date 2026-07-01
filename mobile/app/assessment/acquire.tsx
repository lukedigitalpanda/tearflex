import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'

export default function AcquireScreen() {
  const router = useRouter()
  const { assessmentId, testType } = useLocalSearchParams<{ assessmentId: string; testType: string }>()

  const take = () => router.push({ pathname: '/assessment/instructions', params: { assessmentId, testType } })

  const upload = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 })
    if (res.canceled || !res.assets?.[0]?.uri) return
    router.push({
      pathname: '/assessment/review',
      params: { assessmentId, testType, videoUri: res.assets[0].uri, source: 'upload' },
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 px-4">
      <Text className="mt-6 mb-2 text-xl font-bold text-slate-900">Add a video</Text>
      <Text className="mb-6 text-sm text-slate-600">Record a new video with the Placido attachment, or upload an existing one.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Take a video" onPress={take} activeOpacity={0.8}
        className="mb-3 items-center rounded-xl border-2 border-teal-600 bg-teal-50 py-6">
        <Text className="text-base font-semibold text-teal-700">Take a video</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Upload a video" onPress={upload} activeOpacity={0.8}
        className="items-center rounded-xl border-2 border-slate-300 bg-white py-6">
        <Text className="text-base font-semibold text-slate-700">Upload a video</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}
