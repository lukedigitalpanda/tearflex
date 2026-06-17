'use client'
import Link from 'next/link'
import { useReports } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import { ReportFrame } from '@/components/reports/ReportFrame'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export default function CompareReportsPage({
  params,
}: {
  params: { id: string; reportId: string; otherId: string }
}) {
  const patientId = Number(params.id)
  const ids = [Number(params.reportId), Number(params.otherId)]
  const { data, isLoading } = useReports(patientId)

  if (isLoading) return <LoadingState />

  const reports = (data?.results ?? []).filter((r) => ids.includes(r.id))
  // Earliest assessment first, so chronology reads left → right.
  const ordered = [...reports].sort(
    (a, b) => new Date(a.assessed_at).getTime() - new Date(b.assessed_at).getTime(),
  )
  const sameEye = ordered.length === 2 && ordered[0].eye === ordered[1].eye
  const eyeLabel = ordered[0]?.eye === 'left' ? 'Left' : ordered[0]?.eye === 'right' ? 'Right' : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/patients/${patientId}/reports/${params.reportId}`}>← Back to report</Link>
        </Button>
        {sameEye && (
          <h1 className="text-sm font-medium text-muted-foreground">Comparing {eyeLabel} Eye reports</h1>
        )}
      </div>

      {ordered.length < 2 ? (
        <EmptyState title="Report not found" hint="One of these reports is no longer available." />
      ) : !sameEye ? (
        <EmptyState title="Reports must be for the same eye"
          hint="Comparison is only available between two left-eye or two right-eye reports." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ordered.map((r, i) => (
            <div key={r.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{new Date(r.assessed_at).toLocaleDateString('en-GB')}</span>
                <span className="text-xs text-muted-foreground">
                  {i === 0 ? 'Earlier' : 'Later'}
                </span>
              </div>
              <ReportFrame reportId={r.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
