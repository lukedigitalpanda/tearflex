'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useCreateAssessment } from '@/hooks/useAssessments'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from '@/hooks/useCaptures'
import { VideoFilePicker } from './VideoFilePicker'
import { UploadReviewStep } from './UploadReviewStep'
import { ProcessingStep } from './ProcessingStep'
import { UploadManualEntry, type ManualResultFields } from './UploadManualEntry'
import type { CapturedFrame } from '@/components/player/useVideoFrame'
import type { TestType } from '@shared/types/assessment'

type Phase = 'pick-test' | 'pick-file' | 'review' | 'manual' | 'processing'
const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'nibut', label: 'NIBUT' },
  { value: 'fluorescein', label: 'Fluorescein' },
  { value: 'lipid', label: 'Lipid layer' },
]

export function UploadAssessmentFlow({ patientId, eye }: { patientId: number; eye: string }) {
  const router = useRouter()
  const createAssessment = useCreateAssessment()
  const uploadCapture = useUploadCapture()
  const uploadManual = useUploadManualCapture()
  const createStill = useCreateCaptureStill()

  const [phase, setPhase] = useState<Phase>('pick-test')
  const [testType, setTestType] = useState<TestType>('nibut')
  const [src, setSrc] = useState<string>('')
  const [captureId, setCaptureId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const stillsRef = useRef<CapturedFrame[]>([])
  const assessmentIdRef = useRef<number | null>(null)

  useEffect(() => { return () => { if (src) URL.revokeObjectURL(src) } }, [src])

  const ensureAssessment = async (): Promise<number> => {
    if (assessmentIdRef.current !== null) return assessmentIdRef.current
    const a = await createAssessment.mutateAsync({ patient: patientId, eye })
    assessmentIdRef.current = a.id
    return a.id
  }

  const uploadStills = async (id: number) => {
    await Promise.allSettled(stillsRef.current.map((f) =>
      createStill.mutateAsync({ captureId: id, image: f.image, timestamp_seconds: f.timestampSeconds })))
  }

  const detail = (id: number) => `/patients/${patientId}/assessments/${id}`

  const handleAnalysed = useCallback(() => {
    router.push(`/patients/${patientId}/assessments/${assessmentIdRef.current!}`)
  }, [router, patientId])

  const handleAuto = async () => {
    setBusy(true); setError(null)
    try {
      const assessment = await ensureAssessment()
      const capture = await uploadCapture.mutateAsync({ assessment, test_type: testType, video_file: fileRef.current! })
      setCaptureId(capture.id)
      await uploadStills(capture.id)
      setPhase('processing')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleManualSubmit = async (fields: ManualResultFields) => {
    setBusy(true); setError(null)
    try {
      const assessment = await ensureAssessment()
      const capture = await uploadManual.mutateAsync({ assessment, test_type: testType, video_file: fileRef.current!, ...fields })
      await uploadStills(capture.id)
      await api.patch(`assessments/${assessment}/`, { status: 'complete' })
      api.post('reports/generate/', { assessment }).catch(() => {})
      router.push(detail(assessment))
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'pick-test') {
    return (
      <div className="space-y-5">
        <p className="text-sm font-medium">Which test is this video for?</p>
        <div className="flex gap-3">
          {TEST_TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setTestType(t.value)}
              className={`flex-1 rounded-lg border-2 px-4 py-4 text-sm font-semibold transition-colors ${
                testType === t.value ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-border hover:border-teal-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Button type="button" className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => setPhase('pick-file')}>Continue</Button>
      </div>
    )
  }

  if (phase === 'pick-file') {
    return <VideoFilePicker onFile={(file) => { fileRef.current = file; setSrc(URL.createObjectURL(file)); setPhase('review') }} />
  }

  if (phase === 'review') {
    return (
      <UploadReviewStep
        src={src}
        onCaptureFrame={(f) => stillsRef.current.push(f)}
        onAuto={handleAuto}
        onManual={() => setPhase('manual')}
        busy={busy}
        error={error}
      />
    )
  }

  if (phase === 'manual') {
    return <UploadManualEntry testType={testType} onSubmit={handleManualSubmit} onBack={() => setPhase('review')} busy={busy} />
  }

  // processing
  return <ProcessingStep captureId={captureId!} onAnalysed={handleAnalysed} onRetry={() => { setCaptureId(null); setPhase('review') }} />
}
