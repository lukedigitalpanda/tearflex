'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Resolver } from 'react-hook-form'
import { nibutStepSchema, nibutBand, type NibutStepData, type NibutThresholds } from '@/lib/schemas'
import { usePractice } from '@/hooks/usePractice'

interface Props {
  defaultValues?: NibutStepData | null
  onNext: (data: NibutStepData) => void
  onBack: () => void
}

export function StepNibut({ defaultValues, onNext, onBack }: Props) {
  const { data: practice } = usePractice()
  const thresholds: NibutThresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }

  const { register, handleSubmit, watch, formState: { errors } } = useForm<NibutStepData>({
    resolver: zodResolver(nibutStepSchema) as Resolver<NibutStepData>,
    defaultValues: defaultValues ?? undefined,
  })

  const rawFirst = watch('nibut_first_breakup_seconds')
  const band = nibutBand(Number(rawFirst) || null, thresholds)

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div>
        <Label htmlFor="nibut-first">First break-up time (seconds)</Label>
        <Input
          id="nibut-first"
          type="number"
          step="0.1"
          min="0"
          max="60"
          placeholder="e.g. 7.5"
          {...register('nibut_first_breakup_seconds')}
        />
        {errors.nibut_first_breakup_seconds
          ? <p className="mt-1 text-xs text-red-500">{errors.nibut_first_breakup_seconds.message}</p>
          : rawFirst
            ? <p className="mt-1 text-xs font-medium" style={{ color: band.color }}>{band.label}</p>
            : null}
      </div>
      <div>
        <Label htmlFor="nibut-mean">Mean break-up time (seconds, optional)</Label>
        <Input
          id="nibut-mean"
          type="number"
          step="0.1"
          min="0"
          max="60"
          placeholder="e.g. 9.0"
          {...register('nibut_mean_breakup_seconds')}
        />
        {errors.nibut_mean_breakup_seconds && (
          <p className="mt-1 text-xs text-red-500">{errors.nibut_mean_breakup_seconds.message}</p>
        )}
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700">Continue</Button>
      </div>
    </form>
  )
}
