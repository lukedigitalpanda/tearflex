'use client'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCreateAssessment, useCreateManualCapture } from '@/hooks/useAssessments'
import { nibutBand, type EyeStepData, type NibutStepData, type FluoresceinStepData, type LipidStepData, type NibutThresholds } from '@/lib/schemas'
import { usePractice } from '@/hooks/usePractice'
import { api } from '@/lib/api'

interface Props {
  patientId: number
  stepData: {
    eye: EyeStepData
    nibut: NibutStepData | null
    fluorescein: FluoresceinStepData | null
    lipid: LipidStepData | null
  }
  onBack: () => void
}

export function StepReview({ patientId, stepData, onBack }: Props) {
  const router = useRouter()
  const { data: practice } = usePractice()
  const thresholds: NibutThresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }
  const createAssessment = useCreateAssessment()
  const createCapture = useCreateManualCapture()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    let savedAssessmentId: number | null = null
    try {
      const assessment = await createAssessment.mutateAsync({ patient: patientId, eye: stepData.eye.eye })
      savedAssessmentId = assessment.id

      const captureJobs = []
      if (stepData.nibut) {
        captureJobs.push(createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'nibut',
          nibut_first_breakup_seconds: stepData.nibut.nibut_first_breakup_seconds,
          nibut_mean_breakup_seconds: stepData.nibut.nibut_mean_breakup_seconds ?? undefined,
        }))
      }
      if (stepData.fluorescein) {
        captureJobs.push(createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'fluorescein',
          fluorescein_grade: stepData.fluorescein.fluorescein_grade ?? undefined,
          fluorescein_breakup_seconds: stepData.fluorescein.fluorescein_breakup_seconds ?? undefined,
        }))
      }
      if (stepData.lipid) {
        captureJobs.push(createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'lipid',
          lipid_grade: stepData.lipid.lipid_grade ?? undefined,
          lipid_thickness_nm: stepData.lipid.lipid_thickness_nm ?? undefined,
          tear_meniscus_height_mm: stepData.lipid.tear_meniscus_height_mm ?? undefined,
        }))
      }
      await Promise.all(captureJobs)
      await api.patch(`assessments/${assessment.id}/`, { status: 'complete' })
      router.push(`/patients/${patientId}/assessments/${assessment.id}`)
    } catch {
      if (savedAssessmentId !== null) {
        // captures saved, status patch failed — navigate anyway
        router.push(`/patients/${patientId}/assessments/${savedAssessmentId}`)
        return
      }
      setError('Something went wrong saving the assessment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const nibut = stepData.nibut
  const band = nibutBand(nibut?.nibut_first_breakup_seconds ?? null, thresholds)

  return (
    <div className="space-y-5">
      <Card className="divide-y divide-border p-0 overflow-hidden">
        <Row label="Eye" value={<span className="capitalize">{stepData.eye.eye} eye</span>} />
        <Row
          label="NIBUT — first break-up"
          value={
            nibut
              ? <span className="tabular-nums font-medium" style={{ color: band.color }}>{nibut.nibut_first_breakup_seconds}s — {band.label}</span>
              : <Skipped />
          }
        />
        {nibut?.nibut_mean_breakup_seconds != null && (
          <Row label="NIBUT — mean" value={<span className="tabular-nums">{nibut.nibut_mean_breakup_seconds}s</span>} />
        )}
        <Row
          label="Fluorescein grade"
          value={stepData.fluorescein?.fluorescein_grade != null
            ? <span>{stepData.fluorescein.fluorescein_grade}</span>
            : <Skipped />}
        />
        <Row
          label="Lipid grade"
          value={stepData.lipid?.lipid_grade != null
            ? <span>{stepData.lipid.lipid_grade}</span>
            : <Skipped />}
        />
      </Card>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={saving}>
          Back
        </Button>
        <Button type="button" onClick={handleSave} className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={saving}>
          {saving ? 'Saving…' : 'Save assessment'}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  )
}

function Skipped() {
  return <span className="text-xs text-muted-foreground">Skipped</span>
}
