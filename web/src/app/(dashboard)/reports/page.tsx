import { redirect } from 'next/navigation'

// Reports are now viewed per-patient under the Patients tab.
export default function ReportsPage() {
  redirect('/patients')
}
