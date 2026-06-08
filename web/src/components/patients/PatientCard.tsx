import Link from 'next/link'
import { StatusBadge } from '@/components/common/StatusBadge'
import type { PatientListItem } from '@shared/types/patient'

export function PatientCard({ patient }: { patient: PatientListItem }) {
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
