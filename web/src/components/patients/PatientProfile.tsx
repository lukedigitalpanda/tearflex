'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { usePatient, usePatientTrend } from '@/hooks/usePatients'
import { useAssessments } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { TrendChart } from './TrendChart'
import { EditPatientDialog } from './EditPatientDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export function PatientProfile({ id }: { id: number }) {
  const { data: patient, isLoading } = usePatient(id)
  const { data: trend } = usePatientTrend(id)
  const { data: assessments } = useAssessments({ patient: id })
  const { data: practice } = usePractice()
  const [notesOpen, setNotesOpen] = useState(false)

  if (isLoading || !patient) return <LoadingState />

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          <p className="text-sm text-muted-foreground">DOB {patient.date_of_birth} · {patient.nhs_number || 'No NHS number'}</p>
        </div>
        <EditPatientDialog patient={patient} />
      </div>

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="flex w-full items-center gap-2 p-5 text-left hover:bg-muted/50"
        >
          {notesOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="font-semibold">Notes</span>
        </button>
        {notesOpen && (
          <div className="border-t border-border px-5 pb-5 pt-4">
            {patient.notes
              ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{patient.notes}</p>
              : <p className="text-sm text-muted-foreground">No notes are available for this patient.</p>}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">NIBUT trend</h2>
        <TrendChart data={trend ?? []}
          normal={practice?.nibut_normal_threshold} borderline={practice?.nibut_borderline_threshold} />
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Assessments</h2>
          <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700">
            <Link href={`/patients/${id}/assessments/new`}>New assessment</Link>
          </Button>
        </div>
        {(assessments?.results.length ?? 0) === 0
          ? <EmptyState title="No assessments yet" />
          : (
            <div className="space-y-2">
              {assessments!.results.map((a) => (
                <Link key={a.id} href={`/patients/${id}/assessments/${a.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-4 py-2 hover:border-teal-600">
                  <span className="text-sm">{a.eye} eye · {new Date(a.assessed_at).toLocaleDateString('en-GB')}</span>
                  <span className="text-xs text-muted-foreground">{a.status}</span>
                </Link>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}
