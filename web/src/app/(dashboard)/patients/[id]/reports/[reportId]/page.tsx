'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { reportViewUrl, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'

export default function ReportViewPage({ params }: { params: { id: string; reportId: string } }) {
  const reportId = Number(params.reportId)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // Grow the (same-origin) iframe to its content height so the report shows in
  // full and only the page scrolls — no nested scrollbar. onLoad alone is
  // unreliable for src-loaded iframes, so poll briefly until it's measurable.
  useEffect(() => {
    const fit = () => {
      const frame = frameRef.current
      if (!frame) return
      try {
        const doc = frame.contentDocument
        const h = doc?.documentElement.scrollHeight ?? 0
        if (h > 0) frame.style.height = `${h + 4}px`
      } catch {
        /* leave default height */
      }
    }
    fit()
    const interval = setInterval(fit, 250)
    const stop = setTimeout(() => clearInterval(interval), 3000)
    return () => { clearInterval(interval); clearTimeout(stop) }
  }, [reportId])

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
        ref={frameRef}
        src={reportViewUrl(reportId)}
        title="Report"
        scrolling="no"
        className="block w-full overflow-hidden"
        style={{ height: '70vh' }}
      />
    </div>
  )
}
