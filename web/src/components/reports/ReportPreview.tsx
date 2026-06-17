'use client'
import { downloadReportUrl, useRetryReport } from '@/hooks/useReports'
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
  const unfinished = report.status !== 'ready'

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
      </div>
    </div>
  )
}
