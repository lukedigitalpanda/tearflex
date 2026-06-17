'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Catches client-side render errors anywhere in the dashboard so a single
// broken page doesn't blank the whole app — it offers recovery instead.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This page hit an unexpected error. You can try again or go back to your patients.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => reset()}>Try again</Button>
        <Button asChild className="bg-teal-600 hover:bg-teal-700">
          <Link href="/patients">Back to patients</Link>
        </Button>
      </div>
    </div>
  )
}
