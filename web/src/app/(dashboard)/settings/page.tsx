'use client'
import Link from 'next/link'
import { usePractice } from '@/hooks/usePractice'
import { useIsAdmin } from '@/hooks/useRole'
import { ThresholdForm } from '@/components/settings/ThresholdForm'
import { EditPracticeDialog } from '@/components/settings/EditPracticeDialog'
import { Card } from '@/components/ui/card'

export default function SettingsPage() {
  const { data: practice, isLoading } = usePractice()
  const isAdmin = useIsAdmin()

  const address = practice
    ? [practice.address_line_1, practice.address_line_2, practice.city, practice.postcode].filter(Boolean).join(', ')
    : null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>
      <Card className="p-5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="mb-1 font-semibold">{practice?.name}</h2>
              {address && <p className="text-sm text-muted-foreground">{address}</p>}
              {practice?.phone && <p className="text-sm text-muted-foreground">{practice.phone}</p>}
              {practice?.email && <p className="text-sm text-muted-foreground">{practice.email}</p>}
            </div>
            {isAdmin && practice && <EditPracticeDialog practice={practice} />}
          </div>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Clinical thresholds</h2>
        <ThresholdForm />
      </Card>
      {isAdmin && (
        <Card className="flex items-center justify-between p-5">
          <span className="font-semibold">Clinicians</span>
          <Link href="/settings/clinicians" className="text-sm font-medium text-teal-700 dark:text-teal-400">Manage →</Link>
        </Card>
      )}
      {isAdmin && (
        <Card className="flex items-center justify-between p-5">
          <div>
            <span className="font-semibold">Recently deleted</span>
            <p className="text-xs text-muted-foreground">Recover deleted reports within 30 days.</p>
          </div>
          <Link href="/settings/deleted-reports" className="text-sm font-medium text-teal-700 dark:text-teal-400">Manage →</Link>
        </Card>
      )}
    </div>
  )
}
