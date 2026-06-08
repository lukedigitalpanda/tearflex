import { PatientCard } from './PatientCard'
import { EmptyState } from '@/components/common/EmptyState'
import type { Severity } from '@/lib/severity'

interface Row {
  id: number; first_name: string; last_name: string; full_name: string
  date_of_birth: string; latest_severity: Severity | null; updated_at: string
}

export function PatientList({ patients }: { patients: Row[] }) {
  if (patients.length === 0) return <EmptyState title="No patients found" hint="Add a patient to get started." />
  return (
    <div className="space-y-2">
      {patients.map((p) => <PatientCard key={p.id} patient={p} />)}
    </div>
  )
}
