'use client'
import { Button } from '@/components/ui/button'
import { VideoReviewPlayer } from '@/components/player/VideoReviewPlayer'
import type { CapturedFrame } from '@/components/player/useVideoFrame'

interface Props {
  src: string
  onCaptureFrame: (f: CapturedFrame) => void
  onAuto: () => void
  onManual: () => void
  busy?: boolean
  error?: string | null
}

export function UploadReviewStep({ src, onCaptureFrame, onAuto, onManual, busy, error }: Props) {
  return (
    <div className="space-y-4">
      <VideoReviewPlayer source={src} mode="review" onCaptureFrame={onCaptureFrame} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onManual} disabled={busy}>
          Enter manually
        </Button>
        <Button type="button" className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={onAuto} disabled={busy}>
          Auto-analyse
        </Button>
      </div>
    </div>
  )
}
