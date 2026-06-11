'use client'
import { useState } from 'react'
import { StepEye } from './steps/StepEye'
import { StepNibut } from './steps/StepNibut'
import { StepFluorescein } from './steps/StepFluorescein'
import { StepLipid } from './steps/StepLipid'
import { StepReview } from './steps/StepReview'
import type { EyeStepData, NibutStepData, FluoresceinStepData, LipidStepData } from '@/lib/schemas'

const STEP_LABELS = ['Eye', 'NIBUT', 'Fluorescein', 'Lipid', 'Review'] as const

interface StepData {
  eye: EyeStepData | null
  nibut: NibutStepData | null
  fluorescein: FluoresceinStepData | null
  lipid: LipidStepData | null
}

export function NewAssessmentStepper({ patientId }: { patientId: number }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<StepData>({ eye: null, nibut: null, fluorescein: null, lipid: null })

  return (
    <div className="mx-auto max-w-lg space-y-8">
      {/* Progress indicator */}
      <div className="flex items-start gap-1">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i < step
                ? 'bg-teal-600 text-white'
                : i === step
                  ? 'bg-teal-600 text-white ring-2 ring-teal-200 ring-offset-1'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-medium leading-tight text-center ${
              i === step ? 'text-teal-600' : 'text-muted-foreground'
            }`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Active step */}
      {step === 0 && (
        <StepEye
          defaultValues={data.eye}
          onNext={(d) => { setData((p) => ({ ...p, eye: d })); setStep(1) }}
        />
      )}
      {step === 1 && (
        <StepNibut
          defaultValues={data.nibut}
          onNext={(d) => { setData((p) => ({ ...p, nibut: d })); setStep(2) }}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <StepFluorescein
          defaultValues={data.fluorescein}
          onNext={(d) => { setData((p) => ({ ...p, fluorescein: d })); setStep(3) }}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepLipid
          defaultValues={data.lipid}
          onNext={(d) => { setData((p) => ({ ...p, lipid: d })); setStep(4) }}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && data.eye && data.nibut && (
        <StepReview
          patientId={patientId}
          stepData={{ ...data, eye: data.eye, nibut: data.nibut }}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  )
}
