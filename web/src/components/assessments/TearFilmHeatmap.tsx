export function TearFilmHeatmap({ url }: { url: string | null | undefined }) {
  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        No heatmap available
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Tear film break-up heatmap" className="w-full rounded-lg" />
}
