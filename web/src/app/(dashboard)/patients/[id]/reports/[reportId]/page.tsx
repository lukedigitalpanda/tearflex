'use client'
import Link from 'next/link'
import { reportViewUrl, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'

export default function ReportViewPage({ params }: { params: { id: string; reportId: string } }) {
  const reportId = Number(params.reportId)

  // Grow the (same-origin) iframe to its content height so the report shows at
  // full size and the page scrolls normally, like every other screen.
  const sizeToContent = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const frame = e.currentTarget
    try {
      const doc = frame.contentDocument
      if (doc) frame.style.height = `${doc.documentElement.scrollHeight}px`
    } catch {
      /* leave default height */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/patients/${params.id}`}>← Back to patient</Link>
        </Button>
        <div className="flex items-center gap-3">
          <a href={reportViewUrl(reportId)} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
            Open in new tab
          </a>
          <Button variant="outline" size="sm"
            onClick={() => window.open(downloadReportUrl(reportId), '_blank')}>
            Download
          </Button>
        </div>
      </div>
      <iframe
        src={reportViewUrl(reportId)}
        title="Report"
        onLoad={sizeToContent}
        className="w-full rounded-md border border-border bg-muted"
        style={{ minHeight: '70vh' }}
      />
    </div>
  )
}
