'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useReports, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import { ReportFrame } from '@/components/reports/ReportFrame'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'

export default function ReportViewPage({ params }: { params: { id: string; reportId: string } }) {
  const patientId = Number(params.id)
  const reportId = Number(params.reportId)
  const router = useRouter()
  const { data } = useReports(patientId)
  const [compareOpen, setCompareOpen] = useState(false)

  const reports = data?.results ?? []
  const current = reports.find((r) => r.id === reportId)
  const eyeLabel = current?.eye === 'left' ? 'Left' : current?.eye === 'right' ? 'Right' : ''
  // Only same-eye, finished reports can be compared (left vs left, right vs right).
  const comparable = reports.filter(
    (r) => current && r.eye === current.eye && r.id !== reportId && r.status === 'ready',
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/patients/${patientId}`}>← Back to patient</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Compare</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Compare with another {eyeLabel} Eye report</DialogTitle>
                <DialogDescription>
                  Pick another {eyeLabel} Eye report for this patient to view side by side.
                </DialogDescription>
              </DialogHeader>
              {comparable.length === 0 ? (
                <EmptyState title={`No other ${eyeLabel} Eye reports`}
                  hint="You need at least two reports for the same eye to compare." />
              ) : (
                <div className="space-y-2">
                  {comparable.map((r) => (
                    <button key={r.id} type="button"
                      onClick={() => router.push(`/patients/${patientId}/reports/${reportId}/compare/${r.id}`)}
                      className="flex w-full items-center justify-between rounded-md border border-border px-4 py-2 text-left text-sm hover:border-teal-600">
                      <span>{eyeLabel} Eye · {new Date(r.assessed_at).toLocaleDateString('en-GB')}</span>
                      <span className="text-xs text-muted-foreground">Compare →</span>
                    </button>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
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
