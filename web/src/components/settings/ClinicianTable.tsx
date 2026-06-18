'use client'
import { useClinicians } from '@/hooks/usePractice'
import { useMe } from '@/hooks/useAuth'
import { manageableRoles } from '@/hooks/useRole'
import { ManageClinicianDialog } from '@/components/settings/ManageClinicianDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingState } from '@/components/common/LoadingState'

export function ClinicianTable() {
  const { data, isLoading } = useClinicians()
  const { data: me } = useMe()
  const roles = manageableRoles(me)
  if (isLoading) return <LoadingState rows={3} />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Email</TableHead><TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data?.results ?? []).map((c) => {
          const canManage = roles.includes(c.role) && c.user.email !== me?.user.email
          return (
            <TableRow key={c.id}>
              <TableCell>{c.title} {c.user.first_name} {c.user.last_name}</TableCell>
              <TableCell className="capitalize">{c.role}</TableCell>
              <TableCell>{c.user.email}</TableCell>
              <TableCell className="text-right">
                {canManage && <ManageClinicianDialog clinician={c} />}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
