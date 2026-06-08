'use client'
import { useReports } from '@/hooks/useReports'
import { ReportPreview } from '@/components/reports/ReportPreview'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export default function ReportsPage() {
  const { data, isLoading } = useReports()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      {isLoading ? <LoadingState />
        : (data?.results.length ?? 0) === 0
          ? <EmptyState title="No reports yet" hint="Generate a report from an assessment." />
          : <div className="space-y-2">{data!.results.map((r) => <ReportPreview key={r.id} report={r} />)}</div>}
    </div>
  )
}
