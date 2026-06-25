import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}
