export function TopographyImage({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        Not available
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="w-full rounded-lg" />
}
