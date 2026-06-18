'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { practiceSchema, type PracticeInput } from '@/lib/schemas'
import { useCreatePractice } from '@/hooks/usePractice'

const EMPTY: PracticeInput = {
  name: '', address_line_1: '', address_line_2: '', city: '', postcode: '', phone: '', email: '',
}

export function CreatePracticeDialog() {
  const [open, setOpen] = useState(false)
  const create = useCreatePractice()
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PracticeInput>({
    resolver: zodResolver(practiceSchema), defaultValues: EMPTY,
  })
  const values = watch()
  const onSubmit = (data: PracticeInput) =>
    create.mutate(data, { onSuccess: () => { reset(EMPTY); setOpen(false) } })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-teal-600 hover:bg-teal-700">Create practice</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a practice in your chain</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="cp-name">Practice name {!values.name && <span className="text-xs text-red-500">* required</span>}</Label>
            <Input id="cp-name" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-status-severe">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="cp-addr1">Address line 1 {!values.address_line_1 && <span className="text-xs text-red-500">* required</span>}</Label>
            <Input id="cp-addr1" {...register('address_line_1')} />
            {errors.address_line_1 && <p className="mt-1 text-xs text-status-severe">{errors.address_line_1.message}</p>}
          </div>
          <div>
            <Label htmlFor="cp-addr2">Address line 2</Label>
            <Input id="cp-addr2" {...register('address_line_2')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-city">City {!values.city && <span className="text-xs text-red-500">* required</span>}</Label>
              <Input id="cp-city" {...register('city')} />
              {errors.city && <p className="mt-1 text-xs text-status-severe">{errors.city.message}</p>}
            </div>
            <div>
              <Label htmlFor="cp-postcode">Postcode {!values.postcode && <span className="text-xs text-red-500">* required</span>}</Label>
              <Input id="cp-postcode" {...register('postcode')} />
              {errors.postcode && <p className="mt-1 text-xs text-status-severe">{errors.postcode.message}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="cp-phone">Phone</Label>
            <Input id="cp-phone" type="tel" {...register('phone')} />
          </div>
          <div>
            <Label htmlFor="cp-email">Email</Label>
            <Input id="cp-email" type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-status-severe">{errors.email.message}</p>}
          </div>
          {create.isError && <p className="text-xs text-status-severe">Could not create practice. Please try again.</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create practice'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
