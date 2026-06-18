'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateClinician, useRemoveClinician, usePractices } from '@/hooks/usePractice'
import { useMe } from '@/hooks/useAuth'
import { manageableRoles, canSwitchPractice } from '@/hooks/useRole'
import type { Clinician } from '@shared/types/user'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Practice Admin', clinician: 'Clinician', technician: 'Technician',
}

export function ManageClinicianDialog({ clinician }: { clinician: Clinician }) {
  const [open, setOpen] = useState(false)
  const { data: me } = useMe()
  const update = useUpdateClinician(clinician.id)
  const remove = useRemoveClinician(clinician.id)
  const { data: practices } = usePractices()
  const roles = manageableRoles(me).filter((r) => r !== 'chain_admin')
  const canMove = canSwitchPractice(me)

  const [firstName, setFirstName] = useState(clinician.user.first_name)
  const [lastName, setLastName] = useState(clinician.user.last_name)
  const [role, setRole] = useState(clinician.role)
  const [practiceId, setPracticeId] = useState(clinician.practice.id)

  const onSave = () => {
    const data: Record<string, unknown> = {
      first_name: firstName, last_name: lastName, role,
    }
    if (canMove && practiceId !== clinician.practice.id) data.practice_id = practiceId
    update.mutate(data, { onSuccess: () => setOpen(false) })
  }

  const onRemove = () => {
    if (confirm(`Remove ${clinician.user.first_name} ${clinician.user.last_name}?`)) {
      remove.mutate(undefined, { onSuccess: () => setOpen(false) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Manage {clinician.user.first_name} {clinician.user.last_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mc-fn">First name</Label>
              <Input id="mc-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mc-ln">Last name</Label>
              <Input id="mc-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="mc-role">Role</Label>
            <select id="mc-role" value={role} onChange={(e) => setRole(e.target.value as Clinician['role'])}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          {canMove && (
            <div>
              <Label htmlFor="mc-practice">Practice</Label>
              <select id="mc-practice" value={practiceId} onChange={(e) => setPracticeId(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {practices?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {(update.isError || remove.isError) && <p className="text-xs text-status-severe">Action failed. Please try again.</p>}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" className="text-status-severe" onClick={onRemove} disabled={remove.isPending}>Remove</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={onSave} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
