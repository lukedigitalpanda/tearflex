interface RefreshDeps {
  access: string | undefined
  refresh: string | undefined
  apiBase: string
  fetchImpl?: typeof fetch
  onTokens?: (tokens: { access: string; refresh?: string }) => void
}

/**
 * Calls `url` with the access token; on 401, uses the refresh token to obtain a
 * new pair, reports it via onTokens, and retries the original request once.
 * Pure of Next internals so it is unit-testable.
 */
export async function fetchWithRefresh(url: string, init: RequestInit, deps: RefreshDeps) {
  const doFetch = deps.fetchImpl ?? fetch
  const withAuth = (token: string | undefined): RequestInit => ({
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })

  let res = await doFetch(url, withAuth(deps.access))
  if (res.status !== 401 || !deps.refresh) return res

  const refreshRes = await doFetch(`${deps.apiBase}/auth/refresh/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh: deps.refresh }),
  })
  if (!refreshRes.ok) return res // surface the original 401

  const tokens = (await refreshRes.json()) as { access: string; refresh?: string }
  deps.onTokens?.(tokens)
  res = await doFetch(url, withAuth(tokens.access))
  return res
}
