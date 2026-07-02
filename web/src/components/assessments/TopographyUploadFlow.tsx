'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateAssessment } from '@/hooks/useAssessments'
import { useCreateTopographyScan, useTopographyScanStatus } from '@/hooks/useTopography'
import { TopographyImagePicker } from './TopographyImagePicker'

type Phase = 'pick-images' | 'processing'

export function TopographyUploadFlow({ patientId, eye }: { patientId: number; eye: 'left' | 'right' }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('pick-images')
  const [files, setFiles] = useState<File[]>([])
  const [scanId, setScanId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Assessment created lazily, once — reused across retries.
  const assessmentIdRef = useRef<number | null>(null)
  const createAssessment = useCreateAssessment()
  const createScan = useCreateTopographyScan()
  const { data: statusData, isTimedOut } = useTopographyScanStatus(scanId)

  const status = statusData?.status
  useEffect(() => {
    if (status === 'analysed' && assessmentIdRef.current !== null) {
      router.push(`/patients/${patientId}/assessments/${assessmentIdRef.current}`)
    }
  }, [status, patientId, router])

  const ensureAssessment = async () => {
    if (assessmentIdRef.current !== null) return assessmentIdRef.current
    const assessment = await createAssessment.mutateAsync({ patient: patientId, eye })
    assessmentIdRef.current = assessment.id
    return assessment.id
  }

  const handleSubmit = async () => {
    setBusy(true)
    setError(null)
    try {
      const assessment = await ensureAssessment()
      const scan = await createScan.mutateAsync({ assessment, stills: files })
      setScanId(scan.id)
      setPhase('processing')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // A retry creates a NEW scan (the failed one remains for audit), with the
  // same files retained client-side.
  const handleRetry = () => {
    setScanId(null)
    setPhase('pick-images')
  }

  if (phase === 'processing') {
    if (status === 'failed') {
      return (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-red-500">Analysis failed.</p>
          <button type="button" onClick={handleRetry} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Try again
          </button>
        </div>
      )
    }
    if (isTimedOut) {
      return (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">This is taking longer than expected.</p>
          <button type="button" onClick={handleRetry} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Try again
          </button>
        </div>
      )
    }
    return <p className="py-10 text-center text-sm text-muted-foreground">Processing topography scan…</p>
  }

  return (
    <div className="space-y-4">
      <TopographyImagePicker files={files} onChange={setFiles} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="button"
        disabled={!files.length || busy}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {busy
          ? 'Uploading…'
          : files.length
            ? `Upload ${files.length} image${files.length === 1 ? '' : 's'} & analyse`
            : 'Upload & analyse'}
      </button>
    </div>
  )
}
