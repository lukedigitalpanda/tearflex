'use client'
import { useEffect, useMemo, useState } from 'react'

const MAX_IMAGES = 20 // mirrors backend MAX_STILLS_PER_SCAN

export function TopographyImagePicker({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  )
  useEffect(
    () => () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url))
    },
    [previews],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    if (picked.some((f) => !f.type.startsWith('image/'))) {
      setError('Please choose image files only.')
      return
    }
    const next = [...files, ...picked]
    if (next.length > MAX_IMAGES) {
      setError(`Choose at most ${MAX_IMAGES} images.`)
      return
    }
    setError(null)
    onChange(next)
  }

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <div className="space-y-3">
      <label
        htmlFor="topography-images"
        className="block cursor-pointer rounded-lg border-2 border-dashed border-border px-6 py-10 text-center text-sm font-medium hover:border-teal-300"
      >
        {files.length ? 'Add more images' : 'Choose topography images to upload'}
        <input
          id="topography-images"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handleChange}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Upload photos taken through the Placido attachment — 1 to {MAX_IMAGES}; the
        sharpest is analysed.
      </p>
      {previews.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {previews.map((p, i) => (
            <li key={p.url} className="relative">
              <img src={p.url} alt={p.file.name} className="h-16 w-16 rounded-md object-cover" />
              <button
                type="button"
                aria-label={`Remove ${p.file.name}`}
                onClick={() => removeAt(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-[10px] text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
