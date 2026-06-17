'use client'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { reportViewUrl } from '@/hooks/useReports'

// Renders a report (the same HTML view used everywhere): theme-aware via direct
// class injection (recolours instantly on theme switch, no reload) and sized to
// its content so the page — not the iframe — scrolls.
export function ReportFrame({ reportId }: { reportId: number }) {
  const { resolvedTheme } = useTheme()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)

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
    <iframe
      ref={frameRef}
      src={reportViewUrl(reportId)}
      title="Report"
      scrolling="no"
      className="block w-full overflow-hidden rounded-md border border-border transition-opacity"
      style={{ height: '70vh', opacity: ready ? 1 : 0 }}
    />
  )
}
