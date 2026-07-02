'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_IMAGES = 20 // mirrors backend MAX_STILLS_PER_SCAN

export function TopographyImagePicker({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const urlsRef = useRef(new Map<File, string>())
  const previews = useMemo(() => {
    const urls = urlsRef.current
    return files.map((file) => {
      let url = urls.get(file)
      if (!url) {
        url = URL.createObjectURL(file)
        urls.set(file, url)
      }
      return { file, url }
    })
  }, [files])
  // Revoke URLs for files that were removed; revoke everything on unmount.
  useEffect(() => {
    const urls = urlsRef.current
    const stale: File[] = []
    urls.forEach((url, file) => {
      if (!files.includes(file)) {
        URL.revokeObjectURL(url)
        stale.push(file)
      }
    })
    stale.forEach((file) => urls.delete(file))
  }, [files])
  useEffect(() => {
    const urls = urlsRef.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

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

  const removeAt = (index: number) => {
    setError(null)
    onChange(files.filter((_, i) => i !== index))
  }

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
