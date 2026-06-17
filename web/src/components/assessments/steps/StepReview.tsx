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
    nibut: NibutStepData
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

      const captureJobs = [
        createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'nibut',
          nibut_first_breakup_seconds: stepData.nibut.nibut_first_breakup_seconds,
          nibut_mean_breakup_seconds: stepData.nibut.nibut_mean_breakup_seconds ?? undefined,
        }),
      ]
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
      // Auto-generate the report so a completed assessment always has one
      // (best-effort: don't block navigation if it fails — it can be retried).
      api.post('reports/generate/', { assessment: assessment.id }).catch(() => {})
      router.push(`/patients/${patientId}/assessments/${assessment.id}`)
    } catch {
      if (savedAssessmentId !== null) {
        // captures saved, status patch failed — navigate anyway
        api.post('reports/generate/', { assessment: savedAssessmentId }).catch(() => {})
        router.push(`/patients/${patientId}/assessments/${savedAssessmentId}`)
        return
      }
      setError('Something went wrong saving the assessment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const nibut = stepData.nibut
  const band = nibutBand(nibut.nibut_first_breakup_seconds, thresholds)

  const OXFORD = ['Absent', 'Minimal', 'Mild', 'Moderate', 'Marked', 'Severe']
  const GUILLON = ['Open meshwork (~15nm)', 'Closed meshwork (~30nm)', 'Wave / flow (~60nm)', 'Amorphous (~80nm)', 'Coloured fringes (>90nm)']

  const fluor = stepData.fluorescein
  const lipid = stepData.lipid

  return (
    <div className="space-y-5">
      <Card className="divide-y divide-border p-0 overflow-hidden">

        <SectionHeader label="General" />
        <Row label="Eye" value={<span className="capitalize">{stepData.eye.eye} eye</span>} />

        <SectionHeader label="NIBUT" />
        <Row
          label="First break-up"
          value={<span className="tabular-nums font-medium" style={{ color: band.color }}>{nibut.nibut_first_breakup_seconds}s — {band.label}</span>}
        />
        {nibut.nibut_mean_breakup_seconds != null
          ? <Row label="Mean break-up" value={<span className="tabular-nums">{nibut.nibut_mean_breakup_seconds}s</span>} />
          : <Row label="Mean break-up" value={<NotEntered />} />}

        <SectionHeader label="Fluorescein" />
        {fluor
          ? <>
              <Row
                label="Grade (Oxford)"
                value={fluor.fluorescein_grade != null
                  ? <span>{fluor.fluorescein_grade} — {OXFORD[fluor.fluorescein_grade]}</span>
                  : <NotEntered />}
              />
              {fluor.fluorescein_breakup_seconds != null
                ? <Row label="Break-up time" value={<span className="tabular-nums">{fluor.fluorescein_breakup_seconds}s</span>} />
                : <Row label="Break-up time" value={<NotEntered />} />}
            </>
          : <Row label="Fluorescein" value={<Skipped />} />}

        <SectionHeader label="Lipid layer" />
        {lipid
          ? <>
              <Row
                label="Grade (Guillon)"
                value={lipid.lipid_grade != null
                  ? <span>{lipid.lipid_grade} — {GUILLON[lipid.lipid_grade - 1]}</span>
                  : <NotEntered />}
              />
              {lipid.lipid_thickness_nm != null
                ? <Row label="Thickness" value={<span className="tabular-nums">{lipid.lipid_thickness_nm}nm</span>} />
                : <Row label="Thickness" value={<NotEntered />} />}
              {lipid.tear_meniscus_height_mm != null
                ? <Row label="Tear meniscus" value={<span className="tabular-nums">{lipid.tear_meniscus_height_mm}mm</span>} />
                : <Row label="Tear meniscus" value={<NotEntered />} />}
            </>
          : <Row label="Lipid layer" value={<Skipped />} />}

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

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="bg-muted/50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
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
  return <span className="text-xs text-muted-foreground italic">Skipped</span>
}

function NotEntered() {
  return <span className="text-xs text-muted-foreground">—</span>
}
