'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { patientSchema, type PatientInput } from '@/lib/schemas'
import { useUpdatePatient } from '@/hooks/usePatients'
import type { Patient } from '@shared/types/patient'

export function EditPatientDialog({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false)
  const update = useUpdatePatient(patient.id)
  const { register, handleSubmit, formState: { errors } } = useForm<PatientInput>({
    resolver: zodResolver(patientSchema),
    values: {
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth,
      sex: patient.sex,
      email: patient.email,
      phone: patient.phone,
      nhs_number: patient.nhs_number,
      notes: patient.notes ?? '',
    },
  })

  const onSubmit = (data: PatientInput) =>
    update.mutate(data, { onSuccess: () => setOpen(false) })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Edit patient</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit patient</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ep-fn">First name</Label><Input id="ep-fn" {...register('first_name')} /></div>
            <div><Label htmlFor="ep-ln">Last name</Label><Input id="ep-ln" {...register('last_name')} /></div>
          </div>
          <div>
            <Label htmlFor="ep-dob">Date of birth</Label>
            <Input id="ep-dob" type="date" max={new Date().toISOString().split('T')[0]} {...register('date_of_birth')} />
          </div>
          <div>
            <Label htmlFor="ep-sex">Sex</Label>
            <select id="ep-sex" {...register('sex')}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-600">
              <option value="">Prefer not to say</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div><Label htmlFor="ep-nhs">NHS number</Label><Input id="ep-nhs" {...register('nhs_number')} /></div>
          <div><Label htmlFor="ep-email">Email</Label><Input id="ep-email" type="email" {...register('email')} /></div>
          <div><Label htmlFor="ep-phone">Phone</Label><Input id="ep-phone" {...register('phone')} /></div>
          <div>
            <Label htmlFor="ep-notes">Notes</Label>
            <textarea id="ep-notes" rows={3} {...register('notes')}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-600" />
          </div>
          {Object.values(errors)[0] && (
            <p className="text-xs text-status-severe">{String(Object.values(errors)[0]?.message)}</p>
          )}
          {update.isError && (
            <p className="text-xs text-status-severe">Failed to save. Please try again.</p>
          )}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
