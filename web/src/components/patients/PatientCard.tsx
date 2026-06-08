import Link from 'next/link'
import { StatusBadge } from '@/components/common/StatusBadge'
import type { Severity } from '@/lib/severity'

interface Row {
  id: number; full_name: string; date_of_birth: string
  latest_severity: Severity | null; updated_at: string
}

export function PatientCard({ patient }: { patient: Row }) {
  return (
    <Link href={`/patients/${patient.id}`}
      className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 hover:border-teal-600">
      <div>
        <div className="font-medium">{patient.full_name}</div>
        <div className="text-xs text-slate-600">DOB {patient.date_of_birth}</div>
      </div>
      <StatusBadge severity={patient.latest_severity} />
    </Link>
  )
}
