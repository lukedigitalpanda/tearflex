'use client'
import { useAssessment } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { useReports } from '@/hooks/useReports'
import { ResultsDisplay } from '@/components/assessments/ResultsDisplay'
import { GenerateReportButton } from '@/components/reports/GenerateReportButton'
import { CompareButton } from '@/components/reports/CompareButton'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import type { TestCapture } from '@shared/types/assessment'

export default function AssessmentDetailPage({ params }: { params: { assessmentId: string } }) {
  const { data: assessment, isLoading } = useAssessment(Number(params.assessmentId))
  const { data: practice } = usePractice()
  const { data: reportsData } = useReports(assessment?.patient)
  if (isLoading || !assessment) return <LoadingState />

  const thresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }
  // This assessment's report, if one has been generated — enables Compare.
  const report = (reportsData?.results ?? []).find(
    (r) => r.assessment === assessment.id && r.status === 'ready',
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{assessment.patient_name}</h1>
          <p className="text-sm text-muted-foreground">{assessment.eye} eye · {new Date(assessment.assessed_at).toLocaleString('en-GB')}</p>
        </div>
        <div className="flex items-center gap-2">
          {report && <CompareButton patientId={assessment.patient} reportId={report.id} eye={assessment.eye} />}
          <GenerateReportButton assessmentId={assessment.id} />
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
    </div>
  )
}
