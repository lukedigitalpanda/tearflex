'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Resolver } from 'react-hook-form'
import { fluoresceinStepSchema, type FluoresceinStepData } from '@/lib/schemas'

const OXFORD_LABELS = ['Absent', 'Minimal', 'Mild', 'Moderate', 'Marked', 'Severe'] as const

interface Props {
  defaultValues?: FluoresceinStepData | null
  onNext: (data: FluoresceinStepData | null) => void
  onBack: () => void
}

export function StepFluorescein({ defaultValues, onNext, onBack }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FluoresceinStepData>({
    resolver: zodResolver(fluoresceinStepSchema) as Resolver<FluoresceinStepData>,
    defaultValues: defaultValues ?? undefined,
  })
  const grade = watch('fluorescein_grade')

  return (
    <form onSubmit={handleSubmit((d) => onNext(d))} className="space-y-5">
      <div>
        <Label>Grade — Oxford scale (0–5)</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {OXFORD_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setValue('fluorescein_grade', grade === i ? undefined : i, { shouldValidate: true })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                grade === i
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-border hover:border-teal-300'
              }`}
            >
              {i} — {label}
            </button>
          ))}
        </div>
        {errors.fluorescein_grade && (
          <p className="mt-1 text-xs text-red-500">{errors.fluorescein_grade.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="fluor-but">Break-up time (seconds)</Label>
        <Input
          id="fluor-but"
          type="number"
          step="0.1"
          min="0"
          max="60"
          placeholder="e.g. 6.0"
          {...register('fluorescein_breakup_seconds')}
        />
        {errors.fluorescein_breakup_seconds && (
          <p className="mt-1 text-xs text-red-500">{errors.fluorescein_breakup_seconds.message}</p>
        )}
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="button" variant="outline" onClick={() => onNext(null)} className="flex-1">Skip</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700">Continue</Button>
      </div>
    </form>
  )
}
