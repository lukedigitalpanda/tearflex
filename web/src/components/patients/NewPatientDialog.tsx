'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { patientSchema, type PatientInput } from '@/lib/schemas'
import { useCreatePatient } from '@/hooks/usePatients'

export function NewPatientDialog() {
  const [open, setOpen] = useState(false)
  const create = useCreatePatient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PatientInput>({ resolver: zodResolver(patientSchema) })

  const onSubmit = (data: PatientInput) =>
    create.mutate(data, { onSuccess: () => { reset(); setOpen(false) } })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700">New patient</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New patient</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fn">First name</Label><Input id="fn" {...register('first_name')} /></div>
            <div><Label htmlFor="ln">Last name</Label><Input id="ln" {...register('last_name')} /></div>
          </div>
          <div><Label htmlFor="dob">Date of birth</Label><Input id="dob" type="date" {...register('date_of_birth')} /></div>
          <div><Label htmlFor="nhs">NHS number</Label><Input id="nhs" {...register('nhs_number')} /></div>
          {Object.values(errors)[0] && <p className="text-xs text-status-severe">{String(Object.values(errors)[0]?.message)}</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create patient'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
