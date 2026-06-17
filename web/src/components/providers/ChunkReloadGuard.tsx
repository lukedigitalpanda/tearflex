'use client'
import { useEffect } from 'react'

/**
 * Recovers from stale-bundle failures after a deploy.
 *
 * When the web app is redeployed, JS chunk filenames change. A tab left open
 * across the deploy can request old chunks the new server no longer serves,
 * which can leave the page hung instead of recovering. This guard listens for
 * chunk/dynamic-import load failures and does a single hard reload to pull the
 * current HTML + chunks. A short sessionStorage throttle prevents reload loops
 * if the failure is genuinely persistent.
 */
const RELOAD_KEY = 'tf-chunk-reload-at'
const RELOAD_THROTTLE_MS = 10_000

const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i

function looksLikeChunkError(value: unknown): boolean {
  if (!value) return false
  if (typeof value === 'string') return CHUNK_ERROR_RE.test(value)
  const err = value as { name?: string; message?: string }
  return err.name === 'ChunkLoadError' || CHUNK_ERROR_RE.test(err.message ?? '')
}

export function ChunkReloadGuard() {
  useEffect(() => {
    const recover = () => {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      if (Date.now() - last < RELOAD_THROTTLE_MS) return // already tried very recently — don't loop
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      window.location.reload()
    }

    const onError = (e: ErrorEvent) => {
      if (looksLikeChunkError(e.error) || looksLikeChunkError(e.message)) recover()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      if (looksLikeChunkError(e.reason)) recover()
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
