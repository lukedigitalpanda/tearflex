'use client'
import Link from 'next/link'
import { usePractice } from '@/hooks/usePractice'
import { ThresholdForm } from '@/components/settings/ThresholdForm'
import { Card } from '@/components/ui/card'

export default function SettingsPage() {
  const { data: practice } = usePractice()
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{practice?.name}</h2>
        <p className="text-sm text-slate-600">{practice?.address_line_1}, {practice?.city}, {practice?.postcode}</p>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Clinical thresholds</h2>
        <ThresholdForm />
      </Card>
      <Card className="flex items-center justify-between p-5">
        <span className="font-semibold">Clinicians</span>
        <Link href="/settings/clinicians" className="text-sm font-medium text-teal-700">Manage →</Link>
      </Card>
    </div>
  )
}
