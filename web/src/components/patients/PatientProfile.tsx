'use client'
import Link from 'next/link'
import { usePatient, usePatientTrend } from '@/hooks/usePatients'
import { useAssessments } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { TrendChart } from './TrendChart'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export function PatientProfile({ id }: { id: number }) {
  const { data: patient, isLoading } = usePatient(id)
  const { data: trend } = usePatientTrend(id)
  const { data: assessments } = useAssessments({ patient: id })
  const { data: practice } = usePractice()

  if (isLoading || !patient) return <LoadingState />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{patient.full_name}</h1>
        <p className="text-sm text-slate-600">DOB {patient.date_of_birth} · {patient.nhs_number || 'No NHS number'}</p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">NIBUT trend</h2>
        <TrendChart data={trend ?? []}
          normal={practice?.nibut_normal_threshold} borderline={practice?.nibut_borderline_threshold} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Assessments</h2>
        {(assessments?.results.length ?? 0) === 0
          ? <EmptyState title="No assessments yet" />
          : (
            <div className="space-y-2">
              {assessments!.results.map((a) => (
                <Link key={a.id} href={`/patients/${id}/assessments/${a.id}`}
                  className="flex items-center justify-between rounded-md border border-slate-300 px-4 py-2 hover:border-teal-600">
                  <span className="text-sm">{a.eye} eye · {new Date(a.assessed_at).toLocaleDateString('en-GB')}</span>
                  <span className="text-xs text-slate-600">{a.status}</span>
                </Link>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}
