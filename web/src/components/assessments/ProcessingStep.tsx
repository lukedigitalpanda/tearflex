'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useCaptureStatus } from '@/hooks/useCaptures'

export function ProcessingStep({ captureId, onAnalysed, onRetry }: { captureId: number; onAnalysed: () => void; onRetry: () => void }) {
  const { data, isTimedOut } = useCaptureStatus(captureId)
  const status = data?.status

  useEffect(() => {
    if (status === 'analysed') onAnalysed()
  }, [status, onAnalysed])

  if (status === 'failed') {
    return (
      <div className="py-10 text-center space-y-4">
        <p className="text-sm text-red-500">Analysis failed.</p>
        <Button type="button" className="bg-teal-600 hover:bg-teal-700" onClick={onRetry}>Retry</Button>
      </div>
    )
  }

  if (isTimedOut) {
    return (
      <div className="py-10 text-center space-y-4">
        <p className="text-sm text-muted-foreground">This is taking longer than expected.</p>
        <Button type="button" className="bg-teal-600 hover:bg-teal-700" onClick={onRetry}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium">Processing…</p>
      <p className="mt-1 text-xs text-muted-foreground">Analysing the video. This can take a moment.</p>
    </div>
  )
}
