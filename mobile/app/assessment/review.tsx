import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '@/lib/api'
import { MobileVideoReviewPlayer } from '@/components/player/MobileVideoReviewPlayer'
import type { CapturedFrame } from '@/components/player/types'
import { ManualEntry, type ManualResultFields } from '@/components/assessments/ManualEntry'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from '@/hooks/useCaptures'
import type { TestType } from '@shared/types/assessment'

type Phase = 'review' | 'manual'

export default function ReviewScreen() {
  const router = useRouter()
  const { assessmentId, testType, videoUri, source } = useLocalSearchParams<{
    assessmentId: string; testType: string; videoUri: string; source: string
  }>()
  const uploadAuto = useUploadCapture()
  const uploadManual = useUploadManualCapture()
  const createStill = useCreateCaptureStill()

  const [phase, setPhase] = useState<Phase>('review')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stills = useRef<CapturedFrame[]>([])

  const aId = Number(assessmentId)
  const tType = testType as TestType
  const src = (source === 'mobile' ? 'mobile' : 'upload') as 'mobile' | 'upload'

  const uploadStills = async (captureId: number) => {
    await Promise.allSettled(stills.current.map((f) =>
      createStill.mutateAsync({ captureId, frameUri: f.uri, timestampSeconds: f.timestampSeconds })))
  }

  const handleAuto = async () => {
    setBusy(true); setError(null)
    try {
      const cap = await uploadAuto.mutateAsync({ assessmentId: aId, testType: tType, source: src, videoUri })
      await uploadStills(cap.id)
      router.replace({ pathname: '/assessment/processing', params: { assessmentId, captureId: String(cap.id), testType } })
    } catch {
      setError('Upload failed. Please try again.'); setBusy(false)
    }
  }

  const handleManual = async (fields: ManualResultFields) => {
    setBusy(true); setError(null)
    try {
      const cap = await uploadManual.mutateAsync({ assessmentId: aId, testType: tType, source: src, videoUri, results: fields as Record<string, number> })
      await uploadStills(cap.id)
      await api.patch(`assessments/${assessmentId}/`, { status: 'complete' })
      api.post('reports/generate/', { assessment: aId }).catch(() => {})
      router.replace({ pathname: '/assessment/results', params: { captureId: String(cap.id), testType } })
    } catch {
      setError('Saving failed. Please try again.'); setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ gap: 16, padding: 16 }}
      >
        <MobileVideoReviewPlayer source={videoUri} mode="review" onCaptureFrame={(f) => stills.current.push(f)} />
        {error && <Text className="text-sm text-red-500">{error}</Text>}
        {phase === 'review' ? (
          <View className="flex-row gap-3">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Enter manually"
              onPress={() => setPhase('manual')}
              disabled={busy}
              className="flex-1 items-center rounded-md border border-slate-300 py-3"
            >
              <Text className="font-semibold text-slate-700">Enter manually</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Auto-analyse"
              onPress={handleAuto}
              disabled={busy}
              className="flex-1 items-center rounded-md bg-teal-600 py-3"
            >
              <Text className="font-semibold text-white">{busy ? 'Uploading…' : 'Auto-analyse'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ManualEntry testType={tType} onSubmit={handleManual} onBack={() => setPhase('review')} busy={busy} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
