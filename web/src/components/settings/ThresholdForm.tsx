'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { usePractice, useUpdatePractice } from '@/hooks/usePractice'
import { thresholdSchema } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { z } from 'zod'

type Form = z.infer<typeof thresholdSchema>

export function ThresholdForm() {
  const { data: practice } = usePractice()
  const update = useUpdatePractice()
  const { register, handleSubmit, watch } = useForm<Form>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(thresholdSchema) as any,
    values: practice ? {
      nibut_normal_threshold: practice.nibut_normal_threshold,
      nibut_borderline_threshold: practice.nibut_borderline_threshold,
    } : undefined,
  })

  const values = watch()

  return (
    <form onSubmit={handleSubmit((d) => update.mutate(d))} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="n">NIBUT normal (s) {!values.nibut_normal_threshold && <span className="text-xs text-red-500">* required</span>}</Label><Input id="n" type="number" step="0.1" {...register('nibut_normal_threshold')} /></div>
        <div><Label htmlFor="b">NIBUT borderline (s) {!values.nibut_borderline_threshold && <span className="text-xs text-red-500">* required</span>}</Label><Input id="b" type="number" step="0.1" {...register('nibut_borderline_threshold')} /></div>
      </div>
      <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save thresholds'}
      </Button>
      {update.isSuccess && <p className="text-sm text-status-normal">Saved.</p>}
    </form>
  )
}
