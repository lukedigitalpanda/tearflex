'use client'
import { useState } from 'react'

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export function VideoFilePicker({ onFile }: { onFile: (file: File) => void }) {
  const [chosen, setChosen] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.')
      setChosen(null)
      return
    }
    setError(null)
    setChosen(file)
    onFile(file)
  }

  return (
    <div className="space-y-3">
      <label htmlFor="video-file" className="block cursor-pointer rounded-lg border-2 border-dashed border-border px-6 py-10 text-center text-sm font-medium hover:border-teal-300">
        Choose a video to upload
        <input id="video-file" type="file" accept="video/*" className="sr-only" onChange={handleChange} />
      </label>
      {chosen && (
        <p className="text-sm text-muted-foreground">
          {chosen.name} <span className="tabular-nums">({formatSize(chosen.size)})</span>
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
