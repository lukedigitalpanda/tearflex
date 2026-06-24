'use client'
import Link from 'next/link'
import { useAssessment } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { useReports, downloadReportUrl } from '@/hooks/useReports'
import { useTopographyScans } from '@/hooks/useTopography'
import { TopographyResult } from '@/components/topography/TopographyResult'
import { ResultsDisplay } from '@/components/assessments/ResultsDisplay'
import { GenerateReportButton } from '@/components/reports/GenerateReportButton'
import { CompareButton } from '@/components/reports/CompareButton'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import type { TestCapture } from '@shared/types/assessment'
import type { TopographyScan } from '@shared/types/topography'

export default function AssessmentDetailPage({ params }: { params: { assessmentId: string } }) {
  const { data: assessment, isLoading } = useAssessment(Number(params.assessmentId))
  const { data: practice } = usePractice()
  const { data: reportsData } = useReports(assessment?.patient)
  const { data: topographyData } = useTopographyScans(assessment?.id)
  if (isLoading || !assessment) return <LoadingState />

  const thresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }
  // This assessment's report (any status). Reports auto-generate on completion,
  // so normally one exists; older/failed ones can still be generated manually.
  const report = (reportsData?.results ?? []).find((r) => r.assessment === assessment.id)

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/patients/${assessment.patient}`}>← Back to patient</Link>
      </Button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{assessment.patient_name}</h1>
          <p className="text-sm text-muted-foreground">{assessment.eye} eye · {new Date(assessment.assessed_at).toLocaleString('en-GB')}</p>
        </div>
        <div className="flex items-center gap-2">
          {report?.status === 'ready' && (
            <CompareButton patientId={assessment.patient} reportId={report.id} eye={assessment.eye} />
          )}
          {report?.status === 'ready' ? (
            <Button variant="outline"
              onClick={() => window.open(downloadReportUrl(report.id), '_blank')}>
              Download PDF
            </Button>
          ) : report?.status === 'pending' ? (
            <Button variant="outline" disabled>Generating…</Button>
          ) : (
            <GenerateReportButton assessmentId={assessment.id} />
          )}
        </div>
      </div>

      {assessment.captures.length === 0
        ? <EmptyState title="No captures in this assessment" />
        : assessment.captures.map((c: TestCapture) => (
            <div key={c.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{c.test_type.toUpperCase()}</h2>
              {c.result
                ? <ResultsDisplay result={c.result} thresholds={thresholds} />
                : <EmptyState title="Capture not yet analysed" />}
            </div>
          ))}

      {(topographyData?.results ?? []).map((scan: TopographyScan) => (
        <div key={`topo-${scan.id}`} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">CORNEAL TOPOGRAPHY</h2>
          {scan.result
            ? <TopographyResult result={scan.result} />
            : <EmptyState title="Topography scan not yet analysed" />}
        </div>
      ))}
    </div>
  )
}
