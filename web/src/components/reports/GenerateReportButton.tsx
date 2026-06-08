'use client'
import { useGenerateReport, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'

export function GenerateReportButton({ assessmentId }: { assessmentId: number }) {
  const generate = useGenerateReport()
  return (
    <Button variant="outline"
      onClick={() => generate.mutate(assessmentId, {
        onSuccess: (report) => { if (report.status === 'ready') window.open(downloadReportUrl(report.id), '_blank') },
      })}
      disabled={generate.isPending}>
      {generate.isPending ? 'Generating…' : 'PDF report'}
    </Button>
  )
}
