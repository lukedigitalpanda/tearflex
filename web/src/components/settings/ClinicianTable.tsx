'use client'
import { useClinicians } from '@/hooks/usePractice'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingState } from '@/components/common/LoadingState'

export function ClinicianTable() {
  const { data, isLoading } = useClinicians()
  if (isLoading) return <LoadingState rows={3} />
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Email</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {(data?.results ?? []).map((c) => (
          <TableRow key={c.id}>
            <TableCell>{c.title} {c.user.first_name} {c.user.last_name}</TableCell>
            <TableCell className="capitalize">{c.role}</TableCell>
            <TableCell>{c.user.email}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
