import { PatientProfile } from '@/components/patients/PatientProfile'

export default function PatientProfilePage({ params }: { params: { id: string } }) {
  return <PatientProfile id={Number(params.id)} />
}
