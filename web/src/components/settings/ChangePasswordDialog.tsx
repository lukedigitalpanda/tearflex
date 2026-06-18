'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePasswordSchema, type ChangePasswordInput } from '@/lib/schemas'
import { useChangePassword } from '@/hooks/useAuth'

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const change = useChangePassword()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  })

  const onSubmit = (data: ChangePasswordInput) =>
    change.mutate(
      { current_password: data.current_password, new_password: data.new_password },
      { onSuccess: () => { setDone(true); reset() } },
    )

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setDone(false); change.reset() } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Change password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Change your password</DialogTitle></DialogHeader>
        {done ? (
          <p className="text-sm text-muted-foreground">Your password has been changed.</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label htmlFor="cpw-current">Current password</Label>
              <Input id="cpw-current" type="password" {...register('current_password')} />
              {errors.current_password && <p className="mt-1 text-xs text-status-severe">{errors.current_password.message}</p>}
            </div>
            <div>
              <Label htmlFor="cpw-new">New password</Label>
              <Input id="cpw-new" type="password" {...register('new_password')} />
              {errors.new_password && <p className="mt-1 text-xs text-status-severe">{errors.new_password.message}</p>}
            </div>
            <div>
              <Label htmlFor="cpw-confirm">Confirm new password</Label>
              <Input id="cpw-confirm" type="password" {...register('confirm_password')} />
              {errors.confirm_password && <p className="mt-1 text-xs text-status-severe">{errors.confirm_password.message}</p>}
            </div>
            {change.isError && <p className="text-xs text-status-severe">Current password is incorrect.</p>}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={change.isPending}>
              {change.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
