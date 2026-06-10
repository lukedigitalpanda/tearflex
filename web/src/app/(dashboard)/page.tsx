'use client'
import Link from 'next/link'
import { usePatients } from '@/hooks/usePatients'
import { useAssessments } from '@/hooks/useAssessments'
import { Card } from '@/components/ui/card'
import { NewPatientDialog } from '@/components/patients/NewPatientDialog'

export default function DashboardPage() {
  const { data: patients } = usePatients('')
  const { data: assessments } = useAssessments()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <NewPatientDialog />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Patients</div>
          <div className="text-3xl font-bold tabular-nums">{patients?.count ?? '—'}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Assessments</div>
          <div className="text-3xl font-bold tabular-nums">{assessments?.count ?? '—'}</div></Card>
        <Card className="flex items-center p-5">
          <Link href="/patients" className="text-sm font-medium text-teal-700 dark:text-teal-400">View all patients →</Link>
        </Card>
      </div>
    </div>
  )
}
