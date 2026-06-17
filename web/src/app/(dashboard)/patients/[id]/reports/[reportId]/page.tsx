'use client'
import Link from 'next/link'
import { useReports, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import { ReportFrame } from '@/components/reports/ReportFrame'
import { CompareButton } from '@/components/reports/CompareButton'

export default function ReportViewPage({ params }: { params: { id: string; reportId: string } }) {
  const patientId = Number(params.id)
  const reportId = Number(params.reportId)
  const { data } = useReports(patientId)
  const current = (data?.results ?? []).find((r) => r.id === reportId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/patients/${patientId}`}>← Back to patient</Link>
        </Button>
        <div className="flex items-center gap-2">
          {current && <CompareButton patientId={patientId} reportId={reportId} eye={current.eye} />}
          <Button variant="outline" size="sm"
            onClick={() => window.open(downloadReportUrl(reportId), '_blank')}>
            Download
          </Button>
        </div>
      </div>
      <ReportFrame reportId={reportId} />
    </div>
  )
}
