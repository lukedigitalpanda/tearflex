'use client'
import { useDeletedReports, useRestoreReport } from '@/hooks/useReports'
import { useIsAdmin } from '@/hooks/useRole'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const RETENTION_DAYS = 30

function daysLeft(deletedAt: string) {
  const expiry = new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000
  return Math.max(0, Math.ceil((expiry - Date.now()) / 86_400_000))
}

export function DeletedReportsCard({ patientId }: { patientId: number }) {
  const isAdmin = useIsAdmin()
  const { data } = useDeletedReports(patientId)
  const restore = useRestoreReport()

  // Admin-only, and only shown when there's something to recover.
  const reports = data?.results ?? []
  if (!isAdmin || reports.length === 0) return null

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Recently deleted</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Deleted reports can be recovered for {RETENTION_DAYS} days, then they are permanently removed.
      </p>
      <div className="space-y-2">
        {reports.map((r) => {
          const left = r.deleted_at ? daysLeft(r.deleted_at) : null
          return (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div>
                <div className="font-medium">{r.eye === 'left' ? 'Left' : 'Right'} Eye · {new Date(r.assessed_at).toLocaleDateString('en-GB')}</div>
                <div className="text-xs text-muted-foreground">
                  {r.deleted_at
                    ? `Deleted ${new Date(r.deleted_at).toLocaleDateString('en-GB')} · auto-removes in ${left} day${left === 1 ? '' : 's'}`
                    : 'Deleted'}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={restore.isPending}
                onClick={() => restore.mutate(r.id)}>
                {restore.isPending ? 'Restoring…' : 'Restore'}
              </Button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
