'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { eyeStepSchema, type EyeStepData } from '@/lib/schemas'

interface Props {
  defaultValues?: EyeStepData | null
  onNext: (data: EyeStepData) => void
}

export function StepEye({ defaultValues, onNext }: Props) {
  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<EyeStepData>({
    resolver: zodResolver(eyeStepSchema),
    defaultValues: defaultValues ?? undefined,
  })
  const eye = watch('eye')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium">Which eye is being assessed?</p>
        <div className="flex gap-3">
          {(['left', 'right'] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setValue('eye', e, { shouldValidate: true })}
              className={`flex-1 rounded-lg border-2 px-6 py-5 text-sm font-semibold capitalize transition-colors ${
                eye === e
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-border bg-background hover:border-teal-300'
              }`}
            >
              {e} eye
            </button>
          ))}
        </div>
        {errors.eye && <p className="mt-1 text-xs text-red-500">{errors.eye.message}</p>}
      </div>
      <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700">Continue</Button>
    </form>
  )
}
