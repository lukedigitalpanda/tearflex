import { downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import type { Report } from '@shared/types/api'

export function ReportPreview({ report }: { report: Report }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="font-medium">Assessment #{report.assessment}</div>
        <div className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString('en-GB')} · {report.status}</div>
      </div>
      <Button variant="outline" size="sm" disabled={report.status !== 'ready'}
        onClick={() => window.open(downloadReportUrl(report.id), '_blank')}>
        Download
      </Button>
    </div>
  )
}
