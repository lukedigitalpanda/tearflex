'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TestType } from '@shared/types/assessment'

export interface ManualResultFields {
  nibut_first_breakup_seconds?: number
  nibut_mean_breakup_seconds?: number
  fluorescein_grade?: number
  fluorescein_breakup_seconds?: number
  lipid_grade?: number
  lipid_thickness_nm?: number
  tear_meniscus_height_mm?: number
}

const FIELDS: Record<TestType, { name: keyof ManualResultFields; label: string; required?: boolean }[]> = {
  nibut: [
    { name: 'nibut_first_breakup_seconds', label: 'First break-up (s)', required: true },
    { name: 'nibut_mean_breakup_seconds', label: 'Mean break-up (s)' },
  ],
  fluorescein: [
    { name: 'fluorescein_grade', label: 'Oxford grade (0–5)' },
    { name: 'fluorescein_breakup_seconds', label: 'Break-up time (s)' },
  ],
  lipid: [
    { name: 'lipid_grade', label: 'Guillon grade (1–5)' },
    { name: 'lipid_thickness_nm', label: 'Thickness (nm)' },
    { name: 'tear_meniscus_height_mm', label: 'Tear meniscus (mm)' },
  ],
}

export function UploadManualEntry({ testType, onSubmit, onBack, busy }: {
  testType: TestType
  onSubmit: (fields: ManualResultFields) => void
  onBack: () => void
  busy?: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const fields = FIELDS[testType]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const out: ManualResultFields = {}
    for (const f of fields) {
      const raw = values[f.name]
      if (raw !== undefined && raw !== '') out[f.name] = Number(raw)
      else if (f.required) { setError(`${f.label} is required.`); return }
    }
    setError(null)
    onSubmit(out)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="mb-1 block text-sm font-medium">{f.label}</label>
          <input
            id={f.name}
            type="number"
            step="any"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
          />
        </div>
      ))}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={busy}>Back</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
