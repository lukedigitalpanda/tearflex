'use client'
import { useAssessment } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { ResultsDisplay } from '@/components/assessments/ResultsDisplay'
import { GenerateReportButton } from '@/components/reports/GenerateReportButton'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export default function AssessmentDetailPage({ params }: { params: { assessmentId: string } }) {
  const { data: assessment, isLoading } = useAssessment(Number(params.assessmentId))
  const { data: practice } = usePractice()
  if (isLoading || !assessment) return <LoadingState />

  const thresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{assessment.patient_name}</h1>
          <p className="text-sm text-slate-600">{assessment.eye} eye · {new Date(assessment.assessed_at).toLocaleString('en-GB')}</p>
        </div>
        <GenerateReportButton assessmentId={assessment.id} />
      </div>

      {assessment.captures.length === 0
        ? <EmptyState title="No captures in this assessment" />
        : assessment.captures.map((c) => (
            <div key={c.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">{c.test_type.toUpperCase()}</h2>
              {c.result
                ? <ResultsDisplay result={c.result} thresholds={thresholds} />
                : <EmptyState title="Capture not yet analysed" />}
            </div>
          ))}
    </div>
  )
}
