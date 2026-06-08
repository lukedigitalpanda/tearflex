import { severityMeta, type Severity } from '@/lib/severity'

export function StatusBadge({ severity }: { severity: Severity | null | undefined }) {
  const { color, label } = severityMeta(severity)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
