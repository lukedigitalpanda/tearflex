import { PatientCard } from './PatientCard'
import { EmptyState } from '@/components/common/EmptyState'
import type { PatientListItem } from '@shared/types/patient'

export function PatientList({ patients }: { patients: PatientListItem[] }) {
  if (patients.length === 0) return <EmptyState title="No patients found" hint="Add a patient to get started." />
  return (
    <div className="space-y-2">
      {patients.map((p) => <PatientCard key={p.id} patient={p} />)}
    </div>
  )
}
