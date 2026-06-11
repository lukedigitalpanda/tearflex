import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { NewAssessmentStepper } from '@/components/assessments/NewAssessmentStepper'

export default function NewAssessmentPage({ params }: { params: { id: string } }) {
  const patientId = Number(params.id)
  return (
    <div className="space-y-6">
      <Link
        href={`/patients/${patientId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to patient
      </Link>
      <h1 className="text-xl font-bold">New Assessment</h1>
      <NewAssessmentStepper patientId={patientId} />
    </div>
  )
}
