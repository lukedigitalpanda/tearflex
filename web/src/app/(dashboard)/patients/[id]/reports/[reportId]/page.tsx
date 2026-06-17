'use client'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { reportViewUrl, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'

export default function ReportViewPage({ params }: { params: { id: string; reportId: string } }) {
  const reportId = Number(params.reportId)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)

  // The report renders in a same-origin iframe. Apply the current theme by
  // toggling its `dark` class directly (so switching the app theme recolours
  // the report instantly, with no reload) and size it to its content so the
  // page — not the iframe — scrolls. Re-runs whenever the theme changes.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const apply = () => {
      try {
        const doc = frame.contentDocument
        if (!doc?.documentElement) return
        doc.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
        const h = doc.documentElement.scrollHeight
        if (h > 0 && resolvedTheme) {
          frame.style.height = `${h + 4}px`
          setReady(true)
        }
      } catch {
        /* cross-origin / unsupported — leave as-is */
      }
    }
    apply()
    frame.addEventListener('load', apply)
    const interval = setInterval(apply, 250)
    const stop = setTimeout(() => { clearInterval(interval); setReady(true) }, 3000)
    return () => { frame.removeEventListener('load', apply); clearInterval(interval); clearTimeout(stop) }
  }, [resolvedTheme])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/patients/${params.id}`}>← Back to patient</Link>
        </Button>
        <div className="flex items-center gap-3">
          <a href={reportViewUrl(reportId, dark)} target="_blank" rel="noreferrer"
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
        className="block w-full overflow-hidden rounded-md border border-border transition-opacity"
        style={{ height: '70vh', opacity: ready ? 1 : 0 }}
      />
    </div>
  )
}
