'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useReports } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import type { Eye } from '@shared/types/assessment'

// Opens a picker of the patient's other same-eye reports and navigates to the
// side-by-side comparison. Same eye only (left vs left, right vs right).
export function CompareButton({ patientId, reportId, eye }: { patientId: number; reportId: number; eye: Eye }) {
  const router = useRouter()
  const { data } = useReports(patientId)
  const [open, setOpen] = useState(false)

  const eyeLabel = eye === 'left' ? 'Left' : 'Right'
  const comparable = (data?.results ?? []).filter(
    (r) => r.eye === eye && r.id !== reportId && r.status === 'ready',
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
  )
}
