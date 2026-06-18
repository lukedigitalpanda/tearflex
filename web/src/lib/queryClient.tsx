'use client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/lib/api'

function redirectToLogin() {
  if (typeof window !== 'undefined') window.location.href = '/login'
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Never retry a 401 — the session is dead; retry other errors once.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status === 401) return false
          return failureCount < 1
        },
      },
    },
    queryCache: new QueryCache({
      onError: (error) => { if (error instanceof ApiError && error.status === 401) redirectToLogin() },
    }),
    mutationCache: new MutationCache({
      onError: (error) => { if (error instanceof ApiError && error.status === 401) redirectToLogin() },
    }),
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
