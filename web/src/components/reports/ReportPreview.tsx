'use client'
import { useState } from 'react'
import Link from 'next/link'
import { downloadReportUrl, useRetryReport, useDeleteReport } from '@/hooks/useReports'
import { useIsAdmin } from '@/hooks/useRole'
import { CompareButton } from '@/components/reports/CompareButton'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { Report } from '@shared/types/api'

const STATUS_LABEL: Record<Report['status'], string> = {
  pending: 'Generating…',
  ready: 'Ready',
  failed: 'Generation failed',
}

export function ReportPreview({ report }: { report: Report }) {
  const isAdmin = useIsAdmin()
  const retry = useRetryReport()
  const del = useDeleteReport()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const unfinished = report.status !== 'ready'

  const eye = report.eye === 'left' ? 'Left' : 'Right'
  const when = new Date(report.assessed_at).toLocaleDateString('en-GB')

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="font-medium">{eye} Eye · {when}</div>
        <div className="text-xs text-muted-foreground">
          {report.status === 'ready'
            ? (report.completed_at
                ? `Generated at ${new Date(report.completed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Ready`
                : 'Ready')
            : STATUS_LABEL[report.status]}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && unfinished && (
          <Button variant="ghost" size="sm" disabled={retry.isPending}
            onClick={() => retry.mutate(report.id)}>
            {retry.isPending ? 'Retrying…' : 'Retry'}
          </Button>
        )}
        {report.status === 'ready' ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/patients/${report.patient}/reports/${report.id}`}>View</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>View</Button>
        )}
        {report.status === 'ready' && (
          <CompareButton patientId={report.patient} reportId={report.id} eye={report.eye} />
        )}
        <Button variant="outline" size="sm" disabled={report.status !== 'ready'}
          onClick={() => window.open(downloadReportUrl(report.id), '_blank')}>
          Download
        </Button>
        {isAdmin && (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this report?</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2">
                    <p>The {eye} Eye report from {when} will move to <strong>Settings → Recently deleted</strong>, where it can be restored.</p>
                    <p className="font-medium text-status-severe">
                      It is permanently deleted after 30 days and cannot be recovered after that — restore it before then if it&apos;s still needed.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              {del.isError && (
                <p className="text-xs text-status-severe">Failed to delete. Please try again.</p>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={del.isPending} onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" disabled={del.isPending}
                  onClick={() => del.mutate(report.id, { onSuccess: () => setConfirmOpen(false) })}>
                  {del.isPending ? 'Deleting…' : 'Delete report'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}
