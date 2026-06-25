import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
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

export function ManualEntry({ testType, onSubmit, onBack, busy }: {
  testType: TestType
  onSubmit: (f: ManualResultFields) => void
  onBack: () => void
  busy?: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const fields = FIELDS[testType]

  const submit = () => {
    const out: ManualResultFields = {}
    for (const f of fields) {
      const raw = values[f.name]
      if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) out[f.name] = Number(raw)
      else if (f.required) { setError(`${f.label} is required.`); return }
    }
    setError(null)
    onSubmit(out)
  }

  return (
    <View className="gap-4">
      {fields.map((f) => (
        <View key={f.name}>
          <Text className="mb-1 text-sm font-medium text-slate-700">{f.label}</Text>
          <TextInput
            accessibilityLabel={f.label}
            keyboardType="decimal-pad"
            value={values[f.name] ?? ''}
            onChangeText={(t) => setValues((p) => ({ ...p, [f.name]: t }))}
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </View>
      ))}
      {error && <Text className="text-sm text-red-500">{error}</Text>}
      <View className="flex-row gap-3">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} disabled={busy}
          className="flex-1 items-center rounded-md border border-slate-300 py-3">
          <Text className="font-semibold text-slate-700">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save" onPress={submit} disabled={busy}
          className="flex-1 items-center rounded-md bg-teal-600 py-3">
          <Text className="font-semibold text-white">{busy ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
