export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
