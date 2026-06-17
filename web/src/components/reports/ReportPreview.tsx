'use client'
import { downloadReportUrl, useRetryReport, useDeleteReport } from '@/hooks/useReports'
import { useIsAdmin } from '@/hooks/useRole'
import { Button } from '@/components/ui/button'
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
  const unfinished = report.status !== 'ready'

  const onDelete = () => {
    const when = new Date(report.assessed_at).toLocaleDateString('en-GB')
    const eye = report.eye === 'left' ? 'Left' : 'Right'
    if (window.confirm(`Permanently delete the ${eye} Eye report from ${when}? This cannot be undone.`)) {
      del.mutate(report.id)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="font-medium">{report.eye === 'left' ? 'Left' : 'Right'} Eye · {new Date(report.assessed_at).toLocaleDateString('en-GB')}</div>
        <div className="text-xs text-muted-foreground">{STATUS_LABEL[report.status]}</div>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && unfinished && (
          <Button variant="ghost" size="sm" disabled={retry.isPending}
            onClick={() => retry.mutate(report.id)}>
            {retry.isPending ? 'Retrying…' : 'Retry'}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={report.status !== 'ready'}
          onClick={() => window.open(downloadReportUrl(report.id), '_blank')}>
          Download
        </Button>
        {isAdmin && (
          <Button variant="ghost" size="sm" disabled={del.isPending}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={onDelete}>
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </div>
    </div>
  )
}
