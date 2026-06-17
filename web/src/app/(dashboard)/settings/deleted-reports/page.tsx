'use client'
import Link from 'next/link'
import { useDeletedReports, useRestoreReport } from '@/hooks/useReports'
import { useIsAdmin } from '@/hooks/useRole'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

const RETENTION_DAYS = 30

function daysLeft(deletedAt: string) {
  const expiry = new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000
  return Math.max(0, Math.ceil((expiry - Date.now()) / 86_400_000))
}

export default function DeletedReportsPage() {
  const isAdmin = useIsAdmin()
  const { data, isLoading } = useDeletedReports()
  const restore = useRestoreReport()

  if (!isAdmin) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Recently deleted</h1>
        <EmptyState title="Not available" hint="Only practice admins can recover deleted reports." />
      </div>
    )
  }

  const reports = data?.results ?? []

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Recently deleted</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted reports can be restored here. <strong>They are permanently deleted {RETENTION_DAYS} days
          after deletion</strong> and cannot be recovered after that.
        </p>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : reports.length === 0 ? (
        <EmptyState title="Nothing to recover" hint="Deleted reports will appear here." />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const left = r.deleted_at ? daysLeft(r.deleted_at) : null
            return (
              <Card key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">
                    <Link href={`/patients/${r.patient}`} className="hover:text-teal-700 dark:hover:text-teal-400">
                      {r.patient_name}
                    </Link>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {r.eye === 'left' ? 'Left' : 'Right'} Eye · {new Date(r.assessed_at).toLocaleDateString('en-GB')}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.deleted_at
                      ? `Deleted ${new Date(r.deleted_at).toLocaleDateString('en-GB')} · permanently deleted in ${left} day${left === 1 ? '' : 's'}`
                      : 'Deleted'}
                  </div>
                </div>
                <Button variant="outline" size="sm" disabled={restore.isPending}
                  onClick={() => restore.mutate(r.id)}>
                  {restore.isPending ? 'Restoring…' : 'Restore'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
