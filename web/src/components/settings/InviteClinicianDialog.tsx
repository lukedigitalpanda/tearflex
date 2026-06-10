'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteSchema, type InviteInput } from '@/lib/schemas'
import { useInviteClinician } from '@/hooks/usePractice'
import type { ClinicianInviteResult } from '@shared/types/api'

export function InviteClinicianDialog() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ClinicianInviteResult | null>(null)
  const invite = useInviteClinician()
  const { register, handleSubmit, reset } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema), defaultValues: { role: 'clinician' },
  })

  const onSubmit = (data: InviteInput) =>
    invite.mutate(data, { onSuccess: (r) => { setResult(r); reset() } })

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null) }}>
      <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700">Invite clinician</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite clinician</DialogTitle></DialogHeader>
        {result ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Invite created for {result.email}. Share this link:</p>
            <Input readOnly value={result.invite_url} onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="ifn">First name</Label><Input id="ifn" {...register('first_name')} /></div>
              <div><Label htmlFor="iln">Last name</Label><Input id="iln" {...register('last_name')} /></div>
            </div>
            <div><Label htmlFor="iem">Email</Label><Input id="iem" type="email" {...register('email')} /></div>
            <div>
              <Label htmlFor="irole">Role</Label>
              <select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                <option value="clinician">Clinician</option>
                <option value="technician">Technician</option>
                <option value="admin">Practice Admin</option>
              </select>
            </div>
            {invite.isError && <p className="text-sm text-status-severe">Could not create invite.</p>}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={invite.isPending}>
              {invite.isPending ? 'Inviting…' : 'Create invite'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
