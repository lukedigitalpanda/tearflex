'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Resolver } from 'react-hook-form'
import { lipidStepSchema, type LipidStepData } from '@/lib/schemas'

const GUILLON_LABELS = [
  'Open meshwork (~15nm)',
  'Closed meshwork (~30nm)',
  'Wave / flow (~60nm)',
  'Amorphous (~80nm)',
  'Coloured fringes (>90nm)',
] as const

interface Props {
  defaultValues?: LipidStepData | null
  onNext: (data: LipidStepData | null) => void
  onBack: () => void
}

export function StepLipid({ defaultValues, onNext, onBack }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<LipidStepData>({
    resolver: zodResolver(lipidStepSchema) as Resolver<LipidStepData>,
    defaultValues: defaultValues ?? undefined,
  })
  const grade = watch('lipid_grade')

  return (
    <form onSubmit={handleSubmit((d) => onNext(d))} className="space-y-5">
      <div>
        <Label>Grade — Guillon scale (1–5, optional)</Label>
        <div className="mt-2 flex flex-col gap-1.5">
          {GUILLON_LABELS.map((label, i) => {
            const val = i + 1
            return (
              <button
                key={val}
                type="button"
                onClick={() => setValue('lipid_grade', grade === val ? undefined : val, { shouldValidate: true })}
                className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  grade === val
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-border hover:border-teal-300'
                }`}
              >
                {val} — {label}
              </button>
            )
          })}
        </div>
        {errors.lipid_grade && (
          <p className="mt-1 text-xs text-red-500">{errors.lipid_grade.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="lipid-thick">Thickness (nm, optional)</Label>
          <Input
            id="lipid-thick"
            type="number"
            step="1"
            min="0"
            placeholder="e.g. 60"
            {...register('lipid_thickness_nm')}
          />
          {errors.lipid_thickness_nm && (
            <p className="mt-1 text-xs text-red-500">{errors.lipid_thickness_nm.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="lipid-tmh">Tear meniscus (mm, optional)</Label>
          <Input
            id="lipid-tmh"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 0.25"
            {...register('tear_meniscus_height_mm')}
          />
          {errors.tear_meniscus_height_mm && (
            <p className="mt-1 text-xs text-red-500">{errors.tear_meniscus_height_mm.message}</p>
          )}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="button" variant="outline" onClick={() => onNext(null)} className="flex-1">Skip</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700">Continue</Button>
      </div>
    </form>
  )
}
