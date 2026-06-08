export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center">
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-600/70">{hint}</p>}
    </div>
  )
}
