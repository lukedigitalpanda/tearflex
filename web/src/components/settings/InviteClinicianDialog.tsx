'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteSchema, type InviteInput } from '@/lib/schemas'
import { useInviteClinician, usePractice } from '@/hooks/usePractice'
import { useMe } from '@/hooks/useAuth'
import { manageableRoles, canSwitchPractice } from '@/hooks/useRole'
import type { ClinicianInviteResult } from '@shared/types/api'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Practice Admin', clinician: 'Clinician', technician: 'Technician',
}

export function InviteClinicianDialog() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ClinicianInviteResult | null>(null)
  const invite = useInviteClinician()
  const { data: me } = useMe()
  const roles = manageableRoles(me).filter((r) => r !== 'chain_admin')
  const { data: selectedPractice } = usePractice()
  const showTarget = canSwitchPractice(me)
  const { register, handleSubmit, reset, watch } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema), defaultValues: { role: roles[0] ?? 'clinician' },
  })

  const values = watch()
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
              <div><Label htmlFor="ifn">First name {!values.first_name && <span className="text-xs text-red-500">* required</span>}</Label><Input id="ifn" {...register('first_name')} /></div>
              <div><Label htmlFor="iln">Last name {!values.last_name && <span className="text-xs text-red-500">* required</span>}</Label><Input id="iln" {...register('last_name')} /></div>
            </div>
            <div><Label htmlFor="iem">Email {!values.email && <span className="text-xs text-red-500">* required</span>}</Label><Input id="iem" type="email" {...register('email')} /></div>
            {showTarget && (
              <p className="text-xs text-muted-foreground">
                Inviting to: <span className="font-medium">{selectedPractice?.name ?? '…'}</span>
              </p>
            )}
            <div>
              <Label htmlFor="irole">Role</Label>
              <select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
