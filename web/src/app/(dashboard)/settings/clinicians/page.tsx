'use client'
import { ClinicianTable } from '@/components/settings/ClinicianTable'
import { InviteClinicianDialog } from '@/components/settings/InviteClinicianDialog'

export default function CliniciansPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Clinicians</h1>
        <InviteClinicianDialog />
      </div>
      <ClinicianTable />
    </div>
  )
}
