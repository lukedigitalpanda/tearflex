'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { practiceSchema, type PracticeInput } from '@/lib/schemas'
import { useUpdatePractice } from '@/hooks/usePractice'
import type { Practice } from '@shared/types/user'

export function EditPracticeDialog({ practice }: { practice: Practice }) {
  const [open, setOpen] = useState(false)
  const update = useUpdatePractice()
  const { register, handleSubmit, watch, formState: { errors } } = useForm<PracticeInput>({
    resolver: zodResolver(practiceSchema),
    values: {
      name: practice.name,
      address_line_1: practice.address_line_1,
      address_line_2: practice.address_line_2 ?? '',
      city: practice.city,
      postcode: practice.postcode,
      phone: practice.phone ?? '',
      email: practice.email ?? '',
    },
  })

  const values = watch()

  const onSubmit = (data: PracticeInput) =>
    update.mutate(data, { onSuccess: () => setOpen(false) })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit practice details</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="ep-name">Practice name {!values.name && <span className="text-xs text-red-500">* required</span>}</Label>
            <Input id="ep-name" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-status-severe">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="ep-addr1">Address line 1 {!values.address_line_1 && <span className="text-xs text-red-500">* required</span>}</Label>
            <Input id="ep-addr1" {...register('address_line_1')} />
            {errors.address_line_1 && <p className="mt-1 text-xs text-status-severe">{errors.address_line_1.message}</p>}
          </div>
          <div>
            <Label htmlFor="ep-addr2">Address line 2</Label>
            <Input id="ep-addr2" {...register('address_line_2')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ep-city">City {!values.city && <span className="text-xs text-red-500">* required</span>}</Label>
              <Input id="ep-city" {...register('city')} />
              {errors.city && <p className="mt-1 text-xs text-status-severe">{errors.city.message}</p>}
            </div>
            <div>
              <Label htmlFor="ep-postcode">Postcode {!values.postcode && <span className="text-xs text-red-500">* required</span>}</Label>
              <Input id="ep-postcode" {...register('postcode')} />
              {errors.postcode && <p className="mt-1 text-xs text-status-severe">{errors.postcode.message}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="ep-phone">Phone</Label>
            <Input id="ep-phone" type="tel" {...register('phone')} />
          </div>
          <div>
            <Label htmlFor="ep-email">Email</Label>
            <Input id="ep-email" type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-status-severe">{errors.email.message}</p>}
          </div>
          {update.isError && <p className="text-xs text-status-severe">Failed to save. Please try again.</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
