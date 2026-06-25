'use client'
import { useEffect } from 'react'
import { useCaptureStatus } from '@/hooks/useCaptures'

export function ProcessingStep({ captureId, onAnalysed }: { captureId: number; onAnalysed: () => void }) {
  const { data } = useCaptureStatus(captureId)
  const status = data?.status

  useEffect(() => {
    if (status === 'analysed') onAnalysed()
  }, [status, onAnalysed])

  if (status === 'failed') {
    return <p className="py-10 text-center text-sm text-red-500">Analysis failed. Please try again.</p>
  }

  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium">Processing…</p>
      <p className="mt-1 text-xs text-muted-foreground">Analysing the video. This can take a moment.</p>
    </div>
  )
}
