'use client'
import { useState } from 'react'
import { usePatients } from '@/hooks/usePatients'
import { useDebounce } from '@/hooks/useDebounce'
import { PatientList } from '@/components/patients/PatientList'
import { NewPatientDialog } from '@/components/patients/NewPatientDialog'
import { LoadingState } from '@/components/common/LoadingState'
import { Input } from '@/components/ui/input'

export default function PatientsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading } = usePatients(debouncedSearch)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Patients</h1>
        <NewPatientDialog />
      </div>
      <Input placeholder="Search patients…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {isLoading ? <LoadingState /> : <PatientList patients={data?.results ?? []} />}
    </div>
  )
}
