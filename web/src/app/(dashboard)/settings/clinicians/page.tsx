'use client'
import { ClinicianTable } from '@/components/settings/ClinicianTable'
import { InviteClinicianDialog } from '@/components/settings/InviteClinicianDialog'
import { useIsAdmin } from '@/hooks/useRole'

export default function CliniciansPage() {
  const isAdmin = useIsAdmin()
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Clinicians</h1>
        {isAdmin && <InviteClinicianDialog />}
      </div>
      <ClinicianTable />
    </div>
  )
}
