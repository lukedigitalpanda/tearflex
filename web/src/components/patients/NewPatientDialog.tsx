'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { patientSchema, type PatientInput } from '@/lib/schemas'
import { useCreatePatient } from '@/hooks/usePatients'

export function NewPatientDialog() {
  const [open, setOpen] = useState(false)
  const create = useCreatePatient()
  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<PatientInput>({ resolver: zodResolver(patientSchema) })
  const values = watch()

  const onSubmit = (data: PatientInput) =>
    create.mutate(data, { onSuccess: () => { reset(); setOpen(false) } })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700">New patient</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New patient</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fn">First name {!values.first_name && <span className="text-xs text-red-500">* required</span>}</Label><Input id="fn" {...register('first_name')} /></div>
            <div><Label htmlFor="ln">Last name {!values.last_name && <span className="text-xs text-red-500">* required</span>}</Label><Input id="ln" {...register('last_name')} /></div>
          </div>
          <div><Label htmlFor="dob">Date of birth {!values.date_of_birth && <span className="text-xs text-red-500">* required</span>}</Label><Input id="dob" type="date" max={new Date().toISOString().split('T')[0]} {...register('date_of_birth')} /></div>
          <div>
            <Label htmlFor="sex">Sex {!values.sex && <span className="text-xs text-red-500">* required</span>}</Label>
            <select id="sex" {...register('sex')}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-600">
              <option value="">Select…</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div><Label htmlFor="nhs">NHS number {!values.nhs_number && <span className="text-xs text-red-500">* required</span>}</Label><Input id="nhs" {...register('nhs_number')} /></div>
          <div><Label htmlFor="np-email">Email {!values.email && <span className="text-xs text-red-500">* required</span>}</Label><Input id="np-email" type="email" {...register('email')} /></div>
          <div>
            <Label htmlFor="np-phone">Phone {!values.phone && <span className="text-xs text-red-500">* required</span>}</Label>
            <Controller name="phone" control={control} defaultValue=""
              render={({ field }) => <PhoneInput id="np-phone" value={field.value} onChange={field.onChange} />} />
          </div>
          {Object.values(errors)[0] && <p className="text-xs text-status-severe">{String(Object.values(errors)[0]?.message)}</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create patient'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
