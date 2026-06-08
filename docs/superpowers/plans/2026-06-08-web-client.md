# Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete TearFlex Next.js web client — auth (httpOnly-cookie BFF), patient management, assessment/results views, PDF reports, and practice/clinician admin — against the existing Django backend.

**Architecture:** Next.js 14 App Router. The browser never holds a JWT: client components call **same-origin BFF route handlers** under `src/app/api/*`, which read the access token from an httpOnly cookie, attach it as a `Bearer` header to Django, transparently refresh on 401 (capturing the rotated refresh token), and re-set cookies. TanStack Query owns server state; Zustand holds only non-sensitive session context. Forms use React Hook Form + Zod. Severity→colour banding is a single pure module driven by practice thresholds.

**Tech Stack:** Next.js 14, TypeScript, Tailwind 3, shadcn/ui, TanStack Query, Zustand, React Hook Form, Zod, Recharts, Vitest + Testing Library.

**Depends on:** `2026-06-08-backend-additions.md` (reports + invite endpoints). Build that first.

---

## Prerequisites

- Node 18+ and npm available.
- All commands run from `web/` unless stated. The directory currently holds only `README.md`.
- Backend need not be running (contract-first build; see Verification, Task 22).
- Server env var `API_URL` (the Django base, e.g. `http://localhost:8000/api`) is read only by the BFF — never exposed to the browser.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/.env.local` | `API_URL` for the BFF |
| `web/tailwind.config.ts` | design tokens (teal/slate/status) |
| `web/src/app/globals.css` | shadcn CSS vars + base |
| `web/src/app/layout.tsx` | root layout, Inter font, providers |
| `web/src/lib/server/cookies.ts` | cookie names + set/clear helpers |
| `web/src/lib/server/serverFetch.ts` | authed fetch to Django w/ refresh |
| `web/src/app/api/auth/login/route.ts` | login → set cookies |
| `web/src/app/api/auth/logout/route.ts` | clear cookies |
| `web/src/app/api/auth/me/route.ts` | proxy `me` |
| `web/src/app/api/proxy/[...path]/route.ts` | generic authed JSON proxy |
| `web/src/app/api/download/[id]/route.ts` | stream report PDF |
| `web/src/middleware.ts` | session guard for `(dashboard)` |
| `web/src/lib/api.ts` | browser client over the BFF (`ApiError`) |
| `web/src/lib/severity.ts` | severity/threshold→colour+label (pure) |
| `web/src/lib/schemas.ts` | Zod schemas (login, patient, threshold, invite) |
| `web/src/lib/queryClient.tsx` | TanStack `QueryProvider` |
| `web/src/store/session.ts` | Zustand session store |
| `web/src/hooks/*` | data hooks |
| `web/src/components/*` | UI (layout, patients, assessments, reports, settings, common, ui) |
| `web/src/app/(auth)/login/page.tsx` | login |
| `web/src/app/(dashboard)/*` | dashboard pages |
| `web/src/types/*` | imported from `shared/types` |

Shared types live in the repo's `shared/` (sibling of `web/`); completed here and imported via a tsconfig path alias.

---

## Task 1: Scaffold the Next.js app

**Files:** creates the `web/` project (preserving the existing `README.md`).

- [ ] **Step 1: Scaffold into the existing directory**

From `web/`:

```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

When prompted that the directory is not empty (README.md), choose to continue/overwrite-non-conflicting.

- [ ] **Step 2: Install runtime + test dependencies**

```bash
npm install @tanstack/react-query zustand react-hook-form @hookform/resolvers zod recharts lucide-react clsx tailwind-merge date-fns
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Add the test config**

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})
```

Create `web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add test scripts**

In `web/package.json` `"scripts"`, add:

```json
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Add the shared path alias to tsconfig**

In `web/tsconfig.json`, under `compilerOptions.paths`, add alongside `"@/*"`:

```json
      "@shared/*": ["../shared/*"]
```

- [ ] **Step 6: Remove the default home page**

The scaffold creates `src/app/page.tsx`, which resolves to `/` and would collide
with the dashboard home (`(dashboard)/page.tsx`, Task 19). Delete it now:

```bash
rm web/src/app/page.tsx
```

(The root `/` route is provided by the `(dashboard)` group from Task 12 onward.)

- [ ] **Step 7: Sanity-check the build**

Run: `npm run build`
Expected: a clean build (no home route yet — that's expected until Task 19; the
build still succeeds).

- [ ] **Step 8: Commit**

```bash
git add web/
git commit -m "chore: scaffold Next.js web app with test harness"
```

---

## Task 2: Design tokens, fonts, globals

**Files:**
- Modify: `web/tailwind.config.ts`
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Define colour tokens in Tailwind**

Replace the `theme.extend` block in `web/tailwind.config.ts` so it includes:

```ts
    extend: {
      colors: {
        teal: { 50: '#EFFEFE', 600: '#0E7C7B', 700: '#0A5E5D' },
        slate: { 50: '#F8FAFC', 300: '#CBD5E1', 600: '#475569', 900: '#0F172A' },
        status: {
          normal: '#4ADE80', mild: '#FBBF24', moderate: '#FB923C', severe: '#F87171',
        },
        coral: { 500: '#F97066' },
      },
      fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'] },
    },
```

- [ ] **Step 2: Create the query provider** (before the layout imports it)

Create `web/src/lib/queryClient.tsx`:

```tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 3: Load Inter and set base layout**

Replace `web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/lib/queryClient'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'TearFlex',
  description: 'Smartphone tear film analysis platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-gb" className={inter.variable}>
      <body className="bg-slate-50 text-slate-900 font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Keep globals minimal**

Ensure `web/src/app/globals.css` keeps the `@tailwind base; @tailwind components; @tailwind utilities;` directives (created by the scaffold). No extra changes required.

- [ ] **Step 5: Commit**

```bash
git add web/tailwind.config.ts web/src/app/layout.tsx web/src/app/globals.css
git commit -m "feat: add design tokens and Inter font"
```

---

## Task 3: shadcn/ui primitives

**Files:** creates `web/src/components/ui/*` and `web/src/lib/utils.ts`.

- [ ] **Step 1: Init shadcn**

```bash
npx shadcn@latest init -d
```

Accept defaults (creates `components.json`, `lib/utils.ts` with `cn`).

- [ ] **Step 2: Add the primitives the app uses**

```bash
npx shadcn@latest add button card input label table badge dialog form select skeleton sonner
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes (primitives compile).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/ui web/src/lib/utils.ts web/components.json
git commit -m "feat: add shadcn/ui primitives"
```

---

## Task 4: Complete shared types

**Files:**
- Create: `shared/types/user.ts`
- Create: `shared/types/api.ts`
- Create: `shared/constants/testTypes.ts`

(The repo already has `shared/types/patient.ts`, `assessment.ts`, `constants/thresholds.ts`.)

- [ ] **Step 1: Create `shared/types/user.ts`** (matches the `me` serializer)

```ts
export type ClinicianRole = 'admin' | 'clinician' | 'technician'

export interface Practice {
  id: number
  name: string
  address_line_1: string
  address_line_2: string
  city: string
  postcode: string
  phone: string
  email: string
  is_active: boolean
  nibut_normal_threshold: number
  nibut_borderline_threshold: number
}

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
}

export interface Clinician {
  id: number
  user: User
  practice: Practice
  title: string
  professional_registration: string
  role: ClinicianRole
  created_at: string
}

export interface Me {
  user: User
  clinician: Clinician
}
```

- [ ] **Step 2: Create `shared/types/api.ts`**

```ts
export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiErrorBody {
  detail?: string
  [field: string]: unknown
}

export interface Report {
  id: number
  assessment: number
  generated_by: number | null
  pdf_file: string | null
  status: 'pending' | 'ready' | 'failed'
  created_at: string
}

export interface ClinicianInviteResult {
  id: number
  email: string
  role: string
  token: string
  invite_url: string
}
```

- [ ] **Step 3: Create `shared/constants/testTypes.ts`**

```ts
export const TEST_TYPES = [
  { value: 'nibut', label: 'NIBUT' },
  { value: 'fluorescein', label: 'Fluorescein Break-Up' },
  { value: 'lipid', label: 'Lipid Layer' },
] as const

export type TestType = (typeof TEST_TYPES)[number]['value']
```

- [ ] **Step 4: Add list-item types to the existing patient/assessment files**

The list serializers return a subset of fields, so the hooks need dedicated
list-item types. Append to `shared/types/patient.ts`:

```ts
export interface PatientListItem {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  latest_severity: DryEyeSeverity | null;
  updated_at: string;
}
```

Append to `shared/types/assessment.ts`:

```ts
export interface AssessmentListItem {
  id: number;
  patient: number;
  patient_name: string;
  eye: Eye;
  status: AssessmentStatus;
  assessed_at: string;
  capture_count: number;
}
```

- [ ] **Step 5: Verify they typecheck from web**

Run: `npm run typecheck`
Expected: passes (no consumers yet, but imports resolve via the `@shared/*` alias).

- [ ] **Step 6: Commit**

```bash
git add shared/types/user.ts shared/types/api.ts shared/constants/testTypes.ts shared/types/patient.ts shared/types/assessment.ts
git commit -m "feat: complete shared types (user, api, testTypes, list items)"
```

---

## Task 5: Severity / threshold logic (TDD)

**Files:**
- Create: `web/src/lib/severity.ts`
- Test: `web/src/lib/severity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/severity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { severityMeta, nibutBand } from './severity'

describe('severityMeta', () => {
  it('maps each severity to colour + label', () => {
    expect(severityMeta('normal')).toEqual({ color: '#4ADE80', label: 'Normal' })
    expect(severityMeta('severe')).toEqual({ color: '#F87171', label: 'Severe' })
  })
  it('handles null/unknown as "Not assessed"', () => {
    expect(severityMeta(null).label).toBe('Not assessed')
  })
})

describe('nibutBand', () => {
  const thresholds = { normal: 10, borderline: 5 }
  it('>= normal threshold is normal', () => {
    expect(nibutBand(10, thresholds).key).toBe('normal')
  })
  it('between borderline and normal is borderline', () => {
    expect(nibutBand(7, thresholds).key).toBe('borderline')
  })
  it('below borderline is concern', () => {
    expect(nibutBand(3, thresholds).key).toBe('concern')
  })
  it('null returns unknown', () => {
    expect(nibutBand(null, thresholds).key).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- severity`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `web/src/lib/severity.ts`:

```ts
export type Severity = 'normal' | 'mild' | 'moderate' | 'severe'

const SEVERITY: Record<Severity, { color: string; label: string }> = {
  normal: { color: '#4ADE80', label: 'Normal' },
  mild: { color: '#FBBF24', label: 'Mild' },
  moderate: { color: '#FB923C', label: 'Moderate' },
  severe: { color: '#F87171', label: 'Severe' },
}

export function severityMeta(s: Severity | null | undefined) {
  if (s && s in SEVERITY) return SEVERITY[s]
  return { color: '#CBD5E1', label: 'Not assessed' }
}

export interface NibutThresholds { normal: number; borderline: number }

export function nibutBand(seconds: number | null | undefined, t: NibutThresholds) {
  if (seconds == null) return { key: 'unknown' as const, color: '#CBD5E1', label: 'Not assessed' }
  if (seconds >= t.normal) return { key: 'normal' as const, color: '#4ADE80', label: 'Normal' }
  if (seconds >= t.borderline) return { key: 'borderline' as const, color: '#FBBF24', label: 'Borderline' }
  return { key: 'concern' as const, color: '#F87171', label: 'Concern' }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- severity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/severity.ts web/src/lib/severity.test.ts
git commit -m "feat: severity and NIBUT banding logic"
```

---

## Task 6: BFF cookie helpers + serverFetch refresh (TDD)

**Files:**
- Create: `web/src/lib/server/cookies.ts`
- Create: `web/src/lib/server/serverFetch.ts`
- Test: `web/src/lib/server/serverFetch.test.ts`

- [ ] **Step 1: Write the failing test** (refresh-on-401 logic, decoupled from Next request via injected token accessors)

Create `web/src/lib/server/serverFetch.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fetchWithRefresh } from './serverFetch'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

describe('fetchWithRefresh', () => {
  it('passes through a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    const onTokens = vi.fn()
    const res = await fetchWithRefresh('http://api/x', {}, {
      access: 'a1', refresh: 'r1', apiBase: 'http://api', fetchImpl, onTokens,
    })
    expect(res.status).toBe(200)
    expect(onTokens).not.toHaveBeenCalled()
  })

  it('refreshes on 401, retries once, and reports rotated tokens', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))      // first call
      .mockResolvedValueOnce(jsonResponse(200, { access: 'a2', refresh: 'r2' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))               // retry
    const onTokens = vi.fn()
    const res = await fetchWithRefresh('http://api/x', {}, {
      access: 'a1', refresh: 'r1', apiBase: 'http://api', fetchImpl, onTokens,
    })
    expect(res.status).toBe(200)
    expect(onTokens).toHaveBeenCalledWith({ access: 'a2', refresh: 'r2' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('returns 401 when refresh fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'invalid refresh' }))
    const onTokens = vi.fn()
    const res = await fetchWithRefresh('http://api/x', {}, {
      access: 'a1', refresh: 'r1', apiBase: 'http://api', fetchImpl, onTokens,
    })
    expect(res.status).toBe(401)
    expect(onTokens).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- serverFetch`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the refresh core**

Create `web/src/lib/server/serverFetch.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- serverFetch`
Expected: PASS (all three cases).

- [ ] **Step 5: Add the Next cookie helpers** (not unit-tested; thin wrappers over `next/headers`)

Create `web/src/lib/server/cookies.ts`:

```ts
import { cookies } from 'next/headers'

export const ACCESS_COOKIE = 'tf_access'
export const REFRESH_COOKIE = 'tf_refresh'

const baseOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export function setAuthCookies(access: string, refresh?: string) {
  const store = cookies()
  store.set(ACCESS_COOKIE, access, { ...baseOptions, maxAge: 60 * 55 })          // ~55 min
  if (refresh) store.set(REFRESH_COOKIE, refresh, { ...baseOptions, maxAge: 60 * 60 * 24 * 7 })
}

export function clearAuthCookies() {
  const store = cookies()
  store.delete(ACCESS_COOKIE)
  store.delete(REFRESH_COOKIE)
}

export function readAuthCookies() {
  const store = cookies()
  return {
    access: store.get(ACCESS_COOKIE)?.value,
    refresh: store.get(REFRESH_COOKIE)?.value,
  }
}

export const API_BASE = process.env.API_URL ?? 'http://localhost:8000/api'
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/server/
git commit -m "feat: BFF cookie helpers and refresh-aware serverFetch"
```

---

## Task 7: BFF route handlers

**Files:**
- Create: `web/src/app/api/auth/login/route.ts`
- Create: `web/src/app/api/auth/logout/route.ts`
- Create: `web/src/app/api/auth/me/route.ts`
- Create: `web/src/app/api/proxy/[...path]/route.ts`
- Create: `web/src/app/api/download/[id]/route.ts`
- Create: `web/src/lib/server/proxy.ts`

- [ ] **Step 1: Add a shared proxy helper that wires cookies into `fetchWithRefresh`**

Create `web/src/lib/server/proxy.ts`:

```ts
import { NextResponse } from 'next/server'
import { fetchWithRefresh } from './serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from './cookies'

/** Proxy a JSON request to Django `path` (e.g. "patients/"), handling auth + refresh. */
export async function proxyJson(path: string, init: RequestInit) {
  const { access, refresh } = readAuthCookies()
  let rotated: { access: string; refresh?: string } | null = null

  const res = await fetchWithRefresh(`${API_BASE}/${path}`, init, {
    access, refresh, apiBase: API_BASE,
    onTokens: (t) => { rotated = t },
  })

  if (res.status === 401) {
    clearAuthCookies()
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }

  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await res.json() : await res.text()
  const out = NextResponse.json(body as object, { status: res.status })
  if (rotated) setAuthCookies(rotated.access, rotated.refresh)
  return out
}
```

- [ ] **Step 2: Login handler**

Create `web/src/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { API_BASE, setAuthCookies } from '@/lib/server/cookies'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    return NextResponse.json({ detail: 'Invalid credentials.' }, { status: res.status })
  }
  const { access, refresh } = await res.json()
  setAuthCookies(access, refresh)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Logout handler**

Create `web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/server/cookies'

export async function POST() {
  clearAuthCookies()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Me handler**

Create `web/src/app/api/auth/me/route.ts`:

```ts
import { proxyJson } from '@/lib/server/proxy'

export async function GET() {
  return proxyJson('auth/me/', { method: 'GET' })
}
```

- [ ] **Step 5: Generic proxy handler**

Create `web/src/app/api/proxy/[...path]/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { proxyJson } from '@/lib/server/proxy'

function buildPath(req: NextRequest, path: string[]) {
  const qs = req.nextUrl.search
  return `${path.join('/')}/${qs}`
}

async function handle(req: NextRequest, path: string[]) {
  const method = req.method
  const hasBody = method !== 'GET' && method !== 'DELETE'
  return proxyJson(buildPath(req, path), {
    method,
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    body: hasBody ? await req.text() : undefined,
  })
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
```

- [ ] **Step 6: Report download handler (streams the PDF through cookie auth)**

Create `web/src/app/api/download/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { fetchWithRefresh } from '@/lib/server/serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from '@/lib/server/cookies'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { access, refresh } = readAuthCookies()
  let rotated: { access: string; refresh?: string } | null = null
  const res = await fetchWithRefresh(`${API_BASE}/reports/${ctx.params.id}/download/`, { method: 'GET' }, {
    access, refresh, apiBase: API_BASE, onTokens: (t) => { rotated = t },
  })
  if (res.status === 401) { clearAuthCookies(); return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }) }
  if (!res.ok) return NextResponse.json({ detail: 'Not found.' }, { status: res.status })
  if (rotated) setAuthCookies(rotated.access, rotated.refresh)
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="tearflex_report_${ctx.params.id}.pdf"`,
    },
  })
}
```

- [ ] **Step 7: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/api web/src/lib/server/proxy.ts
git commit -m "feat: BFF route handlers (login, logout, me, proxy, download)"
```

---

## Task 8: Session guard middleware

**Files:**
- Create: `web/src/middleware.ts`

- [ ] **Step 1: Implement the guard** (presence check; API layer enforces validity)

Create `web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('tf_refresh')
  const isLogin = req.nextUrl.pathname.startsWith('/login')

  if (!hasSession && !isLogin) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (hasSession && isLogin) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/middleware.ts
git commit -m "feat: session-guard middleware"
```

---

## Task 9: Browser API client

**Files:**
- Create: `web/src/lib/api.ts`
- Test: `web/src/lib/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/api.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api, ApiError } from './api'

beforeEach(() => { vi.restoreAllMocks() })

describe('api', () => {
  it('GET hits the proxy and returns json', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })
    ))
    const data = await api.get<{ id: number }>('patients/')
    expect(data.id).toBe(1)
    expect(fetch).toHaveBeenCalledWith('/api/proxy/patients/', expect.objectContaining({ method: 'GET', credentials: 'include' }))
  })

  it('throws ApiError with status + detail on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 400, headers: { 'content-type': 'application/json' } })
    ))
    await expect(api.get('patients/')).rejects.toMatchObject({ status: 400, detail: 'nope' })
    await expect(api.get('patients/')).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- api`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `web/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  constructor(public status: number, public detail: string, public body?: unknown) {
    super(detail)
    this.name = 'ApiError'
  }
}

const BASE = '/api/proxy'

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { credentials: 'include', ...init })
  const ct = res.headers.get('content-type') || ''
  const body = ct.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const detail = (body && typeof body === 'object' && 'detail' in body)
      ? String((body as { detail: unknown }).detail)
      : `Request failed (${res.status})`
    throw new ApiError(res.status, detail, body)
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api.ts web/src/lib/api.test.ts
git commit -m "feat: browser API client over the BFF"
```

---

## Task 10: Session store

**Files:**
- Create: `web/src/store/session.ts`

(The query provider was created in Task 2.)

- [ ] **Step 1: Session store (non-sensitive context only)**

Create `web/src/store/session.ts`:

```ts
import { create } from 'zustand'
import type { Me } from '@shared/types/user'

interface SessionState {
  me: Me | null
  setMe: (me: Me | null) => void
}

export const useSession = create<SessionState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}))
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/store/session.ts
git commit -m "feat: session store"
```

---

## Task 11: Data hooks

**Files:**
- Create: `web/src/hooks/useAuth.ts`
- Create: `web/src/hooks/usePatients.ts`
- Create: `web/src/hooks/useAssessments.ts`
- Create: `web/src/hooks/usePractice.ts`
- Create: `web/src/hooks/useReports.ts`

- [ ] **Step 1: Auth hooks**

Create `web/src/hooks/useAuth.ts`:

```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/store/session'
import type { Me } from '@shared/types/user'

export function useMe() {
  const setMe = useSession((s) => s.setMe)
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api.get<Me>('auth/me/')
      setMe(me)
      return me
    },
  })
}

export function useLogin() {
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      fetch('/api/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds),
      }).then(async (r) => { if (!r.ok) throw new Error('Invalid credentials'); return r.json() }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const setMe = useSession((s) => s.setMe)
  return useMutation({
    mutationFn: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),
    onSuccess: () => { setMe(null); qc.clear() },
  })
}
```

- [ ] **Step 2: Patient hooks**

Create `web/src/hooks/usePatients.ts`:

```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@shared/types/api'
import type { Patient, PatientListItem } from '@shared/types/patient'

export function usePatients(search: string, page = 1) {
  const qs = new URLSearchParams({ page: String(page) })
  if (search) qs.set('search', search)
  return useQuery({
    queryKey: ['patients', search, page],
    queryFn: () => api.get<Paginated<PatientListItem>>(`patients/?${qs.toString()}`),
  })
}

export function usePatient(id: number) {
  return useQuery({ queryKey: ['patient', id], queryFn: () => api.get<Patient>(`patients/${id}/`), enabled: !!id })
}

export function usePatientTrend(id: number) {
  return useQuery({ queryKey: ['patient-trend', id], queryFn: () => api.get<{ date: string; nibut: number }[]>(`patients/${id}/trend/`), enabled: !!id })
}

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Patient>) => api.post<Patient>('patients/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  })
}
```

(`Patient` and `PatientListItem` are defined in `shared/types/patient.ts` after Task 4.)

- [ ] **Step 3: Assessment hooks**

Create `web/src/hooks/useAssessments.ts`:

```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@shared/types/api'
import type { Assessment, AssessmentListItem } from '@shared/types/assessment'

export function useAssessments(params: { patient?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.patient) qs.set('patient', String(params.patient))
  return useQuery({
    queryKey: ['assessments', params],
    queryFn: () => api.get<Paginated<AssessmentListItem>>(`assessments/?${qs.toString()}`),
  })
}

export function useAssessment(id: number) {
  return useQuery({ queryKey: ['assessment', id], queryFn: () => api.get<Assessment>(`assessments/${id}/`), enabled: !!id })
}
```

(`Assessment` and `AssessmentListItem` are defined in `shared/types/assessment.ts` after Task 4.)

- [ ] **Step 4: Practice + clinician hooks**

Create `web/src/hooks/usePractice.ts`:

```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Clinician, Practice } from '@shared/types/user'
import type { ClinicianInviteResult } from '@shared/types/api'

export function usePractice() {
  return useQuery({ queryKey: ['practice'], queryFn: () => api.get<Practice>('auth/practice/') })
}

export function useUpdatePractice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Practice>) => api.patch<Practice>('auth/practice/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice'] }),
  })
}

export function useClinicians() {
  return useQuery({ queryKey: ['clinicians'], queryFn: () => api.get<Clinician[]>('auth/practice/clinicians/') })
}

export function useInviteClinician() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; first_name: string; last_name: string; role: string }) =>
      api.post<ClinicianInviteResult>('auth/practice/clinicians/invite/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}
```

- [ ] **Step 5: Report hooks**

Create `web/src/hooks/useReports.ts`:

```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, Report } from '@shared/types/api'

export function useReports() {
  return useQuery({ queryKey: ['reports'], queryFn: () => api.get<Paginated<Report>>('reports/') })
}

export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assessment: number) => api.post<Report>('reports/generate/', { assessment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}

export function downloadReportUrl(id: number) {
  return `/api/download/${id}`
}
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: passes (resolve any shared-type name mismatches surfaced here by adding the aliased exports noted above).

- [ ] **Step 7: Commit**

```bash
git add web/src/hooks
git commit -m "feat: data hooks (auth, patients, assessments, practice, reports)"
```

---

## Task 12: App shell (Sidebar, Header, dashboard layout)

**Files:**
- Create: `web/src/components/layout/Sidebar.tsx`
- Create: `web/src/components/layout/Header.tsx`
- Create: `web/src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Sidebar**

Create `web/src/components/layout/Sidebar.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FileText, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-60 shrink-0 border-r border-slate-300 bg-white p-4">
      <div className="mb-8 px-2 text-xl font-bold text-teal-600">TearFlex</div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                active ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50')}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Header**

Create `web/src/components/layout/Header.tsx`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useMe, useLogout } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

export function Header() {
  const { data: me } = useMe()
  const logout = useLogout()
  const router = useRouter()
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-300 bg-white px-6">
      <div className="text-sm text-slate-600">{me?.clinician.practice.name ?? ''}</div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">{me ? `${me.user.first_name} ${me.user.last_name}` : ''}</span>
        <Button variant="ghost" size="sm"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Dashboard layout**

Create `web/src/app/(dashboard)/layout.tsx`:

```tsx
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/layout web/src/app/\(dashboard\)/layout.tsx
git commit -m "feat: dashboard app shell (sidebar, header)"
```

---

## Task 13: Login page

**Files:**
- Create: `web/src/lib/schemas.ts`
- Create: `web/src/app/(auth)/login/page.tsx`
- Test: `web/src/app/(auth)/login/page.test.tsx`

- [ ] **Step 1: Add Zod schemas**

Create `web/src/lib/schemas.ts`:

```ts
import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const patientSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  date_of_birth: z.string().min(1, 'Required'),
  sex: z.enum(['M', 'F', 'O']).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  nhs_number: z.string().optional(),
})
export type PatientInput = z.infer<typeof patientSchema>

export const thresholdSchema = z.object({
  nibut_normal_threshold: z.coerce.number().positive(),
  nibut_borderline_threshold: z.coerce.number().positive(),
})

export const inviteSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  role: z.enum(['admin', 'clinician', 'technician']),
})
export type InviteInput = z.infer<typeof inviteSchema>
```

- [ ] **Step 2: Write the failing smoke test**

Create `web/src/app/(auth)/login/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from './page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function renderPage() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><LoginPage /></QueryClientProvider>)
}

describe('LoginPage', () => {
  it('renders username, password, and submit', () => {
    renderPage()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run test -- login`
Expected: FAIL — page missing.

- [ ] **Step 4: Implement the login page**

Create `web/src/app/(auth)/login/page.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { loginSchema, type LoginInput } from '@/lib/schemas'
import { useLogin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const login = useLogin()
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = (data: LoginInput) =>
    login.mutate(data, { onSuccess: () => router.push('/') })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        <p className="mb-6 text-sm text-slate-600">Sign in to your practice account</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input id="username" {...register('username')} />
            {errors.username && <p className="mt-1 text-xs text-status-severe">{errors.username.message}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}
          </div>
          {login.isError && <p className="text-sm text-status-severe">Invalid username or password.</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm run test -- login`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/schemas.ts "web/src/app/(auth)"
git commit -m "feat: login page with validation"
```

---

## Task 14: Common components (StatusBadge, states)

**Files:**
- Create: `web/src/components/common/StatusBadge.tsx`
- Create: `web/src/components/common/EmptyState.tsx`
- Create: `web/src/components/common/LoadingState.tsx`
- Test: `web/src/components/common/StatusBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/common/StatusBadge.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the severity label', () => {
    render(<StatusBadge severity="moderate" />)
    expect(screen.getByText('Moderate')).toBeInTheDocument()
  })
  it('renders "Not assessed" for null', () => {
    render(<StatusBadge severity={null} />)
    expect(screen.getByText('Not assessed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- StatusBadge`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the three components**

Create `web/src/components/common/StatusBadge.tsx`:

```tsx
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
```

Create `web/src/components/common/EmptyState.tsx`:

```tsx
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center">
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-600/70">{hint}</p>}
    </div>
  )
}
```

Create `web/src/components/common/LoadingState.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- StatusBadge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/common
git commit -m "feat: common components (status badge, empty/loading states)"
```

---

## Task 15: Patient list + new-patient dialog

**Files:**
- Create: `web/src/components/patients/PatientCard.tsx`
- Create: `web/src/components/patients/PatientList.tsx`
- Create: `web/src/components/patients/NewPatientDialog.tsx`
- Create: `web/src/app/(dashboard)/patients/page.tsx`
- Test: `web/src/components/patients/PatientList.test.tsx`

- [ ] **Step 1: Write the failing test** (list renders rows from data)

Create `web/src/components/patients/PatientList.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PatientList } from './PatientList'

const patients = [
  { id: 1, first_name: 'Jane', last_name: 'Doe', full_name: 'Jane Doe', date_of_birth: '1980-01-01', latest_severity: 'mild', updated_at: '2026-06-01T10:00:00Z' },
  { id: 2, first_name: 'John', last_name: 'Roe', full_name: 'John Roe', date_of_birth: '1975-05-05', latest_severity: null, updated_at: '2026-06-02T10:00:00Z' },
]

describe('PatientList', () => {
  it('renders a row per patient', () => {
    render(<PatientList patients={patients as never} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('John Roe')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- PatientList`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement PatientCard + PatientList**

Create `web/src/components/patients/PatientCard.tsx`:

```tsx
import Link from 'next/link'
import { StatusBadge } from '@/components/common/StatusBadge'
import type { Severity } from '@/lib/severity'

interface Row {
  id: number; full_name: string; date_of_birth: string
  latest_severity: Severity | null; updated_at: string
}

export function PatientCard({ patient }: { patient: Row }) {
  return (
    <Link href={`/patients/${patient.id}`}
      className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 hover:border-teal-600">
      <div>
        <div className="font-medium">{patient.full_name}</div>
        <div className="text-xs text-slate-600">DOB {patient.date_of_birth}</div>
      </div>
      <StatusBadge severity={patient.latest_severity} />
    </Link>
  )
}
```

Create `web/src/components/patients/PatientList.tsx`:

```tsx
import { PatientCard } from './PatientCard'
import { EmptyState } from '@/components/common/EmptyState'
import type { Severity } from '@/lib/severity'

interface Row {
  id: number; first_name: string; last_name: string; full_name: string
  date_of_birth: string; latest_severity: Severity | null; updated_at: string
}

export function PatientList({ patients }: { patients: Row[] }) {
  if (patients.length === 0) return <EmptyState title="No patients found" hint="Add a patient to get started." />
  return (
    <div className="space-y-2">
      {patients.map((p) => <PatientCard key={p.id} patient={p} />)}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- PatientList`
Expected: PASS.

- [ ] **Step 5: Implement the new-patient dialog**

Create `web/src/components/patients/NewPatientDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { patientSchema, type PatientInput } from '@/lib/schemas'
import { useCreatePatient } from '@/hooks/usePatients'

export function NewPatientDialog() {
  const [open, setOpen] = useState(false)
  const create = useCreatePatient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PatientInput>({ resolver: zodResolver(patientSchema) })

  const onSubmit = (data: PatientInput) =>
    create.mutate(data, { onSuccess: () => { reset(); setOpen(false) } })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700">New patient</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New patient</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fn">First name</Label><Input id="fn" {...register('first_name')} /></div>
            <div><Label htmlFor="ln">Last name</Label><Input id="ln" {...register('last_name')} /></div>
          </div>
          <div><Label htmlFor="dob">Date of birth</Label><Input id="dob" type="date" {...register('date_of_birth')} /></div>
          <div><Label htmlFor="nhs">NHS number</Label><Input id="nhs" {...register('nhs_number')} /></div>
          {Object.values(errors)[0] && <p className="text-xs text-status-severe">{String(Object.values(errors)[0]?.message)}</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create patient'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Implement the patients page**

Create `web/src/app/(dashboard)/patients/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { usePatients } from '@/hooks/usePatients'
import { PatientList } from '@/components/patients/PatientList'
import { NewPatientDialog } from '@/components/patients/NewPatientDialog'
import { LoadingState } from '@/components/common/LoadingState'
import { Input } from '@/components/ui/input'

export default function PatientsPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = usePatients(search)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Patients</h1>
        <NewPatientDialog />
      </div>
      <Input placeholder="Search patients…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {isLoading ? <LoadingState /> : <PatientList patients={(data?.results ?? []) as never} />}
    </div>
  )
}
```

- [ ] **Step 7: Verify tests + build**

Run: `npm run test -- PatientList && npm run build`
Expected: test PASS, build passes.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/patients "web/src/app/(dashboard)/patients/page.tsx"
git commit -m "feat: patient list, search, and new-patient dialog"
```

---

## Task 16: Patient profile + trend chart

**Files:**
- Create: `web/src/components/patients/TrendChart.tsx`
- Create: `web/src/components/patients/PatientProfile.tsx`
- Create: `web/src/app/(dashboard)/patients/[id]/page.tsx`

- [ ] **Step 1: Trend chart**

Create `web/src/components/patients/TrendChart.tsx`:

```tsx
'use client'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'

interface Point { date: string; nibut: number }

export function TrendChart({ data, normal = 10, borderline = 5 }: { data: Point[]; normal?: number; borderline?: number }) {
  if (data.length === 0) return <p className="text-sm text-slate-600">No trend data yet.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#475569" />
        <YAxis tick={{ fontSize: 12 }} stroke="#475569" unit="s" />
        <Tooltip />
        <ReferenceLine y={normal} stroke="#4ADE80" strokeDasharray="4 4" />
        <ReferenceLine y={borderline} stroke="#FBBF24" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="nibut" stroke="#0E7C7B" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Patient profile**

Create `web/src/components/patients/PatientProfile.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePatient, usePatientTrend } from '@/hooks/usePatients'
import { useAssessments } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { TrendChart } from './TrendChart'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export function PatientProfile({ id }: { id: number }) {
  const { data: patient, isLoading } = usePatient(id)
  const { data: trend } = usePatientTrend(id)
  const { data: assessments } = useAssessments({ patient: id })
  const { data: practice } = usePractice()

  if (isLoading || !patient) return <LoadingState />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{patient.full_name}</h1>
        <p className="text-sm text-slate-600">DOB {patient.date_of_birth} · {patient.nhs_number || 'No NHS number'}</p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">NIBUT trend</h2>
        <TrendChart data={trend ?? []}
          normal={practice?.nibut_normal_threshold} borderline={practice?.nibut_borderline_threshold} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Assessments</h2>
        {(assessments?.results.length ?? 0) === 0
          ? <EmptyState title="No assessments yet" />
          : (
            <div className="space-y-2">
              {assessments!.results.map((a) => (
                <Link key={a.id} href={`/patients/${id}/assessments/${a.id}`}
                  className="flex items-center justify-between rounded-md border border-slate-300 px-4 py-2 hover:border-teal-600">
                  <span className="text-sm">{a.eye} eye · {new Date(a.assessed_at).toLocaleDateString('en-GB')}</span>
                  <span className="text-xs text-slate-600">{a.status}</span>
                </Link>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Profile page route**

Create `web/src/app/(dashboard)/patients/[id]/page.tsx`:

```tsx
import { PatientProfile } from '@/components/patients/PatientProfile'

export default function PatientProfilePage({ params }: { params: { id: string } }) {
  return <PatientProfile id={Number(params.id)} />
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/patients/TrendChart.tsx web/src/components/patients/PatientProfile.tsx "web/src/app/(dashboard)/patients/[id]/page.tsx"
git commit -m "feat: patient profile with NIBUT trend chart"
```

---

## Task 17: Assessment detail + results + generate report

**Files:**
- Create: `web/src/components/assessments/TearFilmHeatmap.tsx`
- Create: `web/src/components/assessments/ResultsDisplay.tsx`
- Create: `web/src/components/reports/GenerateReportButton.tsx`
- Create: `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`
- Test: `web/src/components/assessments/ResultsDisplay.test.tsx`

- [ ] **Step 1: Write the failing test** (results show NIBUT headline + graceful nulls)

Create `web/src/components/assessments/ResultsDisplay.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultsDisplay } from './ResultsDisplay'

const result = {
  nibut_first_breakup_seconds: 8.2, nibut_mean_breakup_seconds: 9.1, nibut_heatmap: null,
  fluorescein_grade: null, fluorescein_breakup_seconds: null,
  lipid_grade: null, lipid_thickness_nm: null, tear_meniscus_height_mm: null,
  dry_eye_severity: 'mild' as const, confidence_score: 0.8,
}

describe('ResultsDisplay', () => {
  it('shows the NIBUT headline and severity', () => {
    render(<ResultsDisplay result={result as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.getByText(/8.2/)).toBeInTheDocument()
    expect(screen.getByText('Mild')).toBeInTheDocument()
  })
  it('shows "Not assessed" for missing fluorescein', () => {
    render(<ResultsDisplay result={result as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.getAllByText(/not assessed/i).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- ResultsDisplay`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement heatmap + results**

Create `web/src/components/assessments/TearFilmHeatmap.tsx`:

```tsx
export function TearFilmHeatmap({ url }: { url: string | null | undefined }) {
  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-600">
        No heatmap available
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Tear film break-up heatmap" className="w-full rounded-lg" />
}
```

Create `web/src/components/assessments/ResultsDisplay.tsx`:

```tsx
import { nibutBand, severityMeta, type Severity, type NibutThresholds } from '@/lib/severity'
import { TearFilmHeatmap } from './TearFilmHeatmap'
import { Card } from '@/components/ui/card'

interface Result {
  nibut_first_breakup_seconds: number | null
  nibut_mean_breakup_seconds: number | null
  nibut_heatmap: string | null
  fluorescein_grade: number | null
  lipid_grade: number | null
  tear_meniscus_height_mm: number | null
  dry_eye_severity: Severity | null
  confidence_score: number | null
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-600">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  )
}

export function ResultsDisplay({ result, thresholds }: { result: Result; thresholds: NibutThresholds }) {
  const band = nibutBand(result.nibut_first_breakup_seconds, thresholds)
  const sev = severityMeta(result.dry_eye_severity)

  return (
    <div className="space-y-4">
      <Card className="p-6" style={{ backgroundColor: `${band.color}18` }}>
        <div className="text-xs uppercase text-slate-600">NIBUT — first break-up</div>
        <div className="text-5xl font-bold tabular-nums" style={{ color: band.color }}>
          {result.nibut_first_breakup_seconds != null ? `${result.nibut_first_breakup_seconds.toFixed(1)}s` : '—'}
        </div>
        <div className="mt-1 text-sm font-medium" style={{ color: sev.color }}>{sev.label}</div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        <Metric label="NIBUT mean" value={result.nibut_mean_breakup_seconds != null ? `${result.nibut_mean_breakup_seconds.toFixed(1)}s` : 'Not assessed'} />
        <Metric label="Fluorescein grade" value={result.fluorescein_grade != null ? String(result.fluorescein_grade) : 'Not assessed'} />
        <Metric label="Lipid grade" value={result.lipid_grade != null ? String(result.lipid_grade) : 'Not assessed'} />
        <Metric label="Tear meniscus" value={result.tear_meniscus_height_mm != null ? `${result.tear_meniscus_height_mm}mm` : 'Not assessed'} />
        <Metric label="Confidence" value={result.confidence_score != null ? `${Math.round(result.confidence_score * 100)}%` : 'Not assessed'} />
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Tear film heatmap</h3>
        <TearFilmHeatmap url={result.nibut_heatmap} />
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- ResultsDisplay`
Expected: PASS.

- [ ] **Step 5: Generate-report button**

Create `web/src/components/reports/GenerateReportButton.tsx`:

```tsx
'use client'
import { useGenerateReport, downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'

export function GenerateReportButton({ assessmentId }: { assessmentId: number }) {
  const generate = useGenerateReport()
  return (
    <Button variant="outline"
      onClick={() => generate.mutate(assessmentId, {
        onSuccess: (report) => { if (report.status === 'ready') window.open(downloadReportUrl(report.id), '_blank') },
      })}
      disabled={generate.isPending}>
      {generate.isPending ? 'Generating…' : 'PDF report'}
    </Button>
  )
}
```

- [ ] **Step 6: Assessment detail page**

Create `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`:

```tsx
'use client'
import { useAssessment } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { ResultsDisplay } from '@/components/assessments/ResultsDisplay'
import { GenerateReportButton } from '@/components/reports/GenerateReportButton'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export default function AssessmentDetailPage({ params }: { params: { assessmentId: string } }) {
  const { data: assessment, isLoading } = useAssessment(Number(params.assessmentId))
  const { data: practice } = usePractice()
  if (isLoading || !assessment) return <LoadingState />

  const thresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{assessment.patient_name}</h1>
          <p className="text-sm text-slate-600">{assessment.eye} eye · {new Date(assessment.assessed_at).toLocaleString('en-GB')}</p>
        </div>
        <GenerateReportButton assessmentId={assessment.id} />
      </div>

      {assessment.captures.length === 0
        ? <EmptyState title="No captures in this assessment" />
        : assessment.captures.map((c) => (
            <div key={c.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">{c.test_type.toUpperCase()}</h2>
              {c.result
                ? <ResultsDisplay result={c.result as never} thresholds={thresholds} />
                : <EmptyState title="Capture not yet analysed" />}
            </div>
          ))}
    </div>
  )
}
```

- [ ] **Step 7: Verify tests + build**

Run: `npm run test -- ResultsDisplay && npm run build`
Expected: PASS + build passes.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/assessments web/src/components/reports/GenerateReportButton.tsx "web/src/app/(dashboard)/patients/[id]/assessments"
git commit -m "feat: assessment detail with results display and report generation"
```

---

## Task 18: Reports list page

**Files:**
- Create: `web/src/components/reports/ReportPreview.tsx`
- Create: `web/src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Report row/preview component**

Create `web/src/components/reports/ReportPreview.tsx`:

```tsx
import { downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import type { Report } from '@shared/types/api'

export function ReportPreview({ report }: { report: Report }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3">
      <div>
        <div className="font-medium">Assessment #{report.assessment}</div>
        <div className="text-xs text-slate-600">{new Date(report.created_at).toLocaleString('en-GB')} · {report.status}</div>
      </div>
      <Button variant="outline" size="sm" disabled={report.status !== 'ready'}
        onClick={() => window.open(downloadReportUrl(report.id), '_blank')}>
        Download
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Reports page**

Create `web/src/app/(dashboard)/reports/page.tsx`:

```tsx
'use client'
import { useReports } from '@/hooks/useReports'
import { ReportPreview } from '@/components/reports/ReportPreview'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'

export default function ReportsPage() {
  const { data, isLoading } = useReports()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      {isLoading ? <LoadingState />
        : (data?.results.length ?? 0) === 0
          ? <EmptyState title="No reports yet" hint="Generate a report from an assessment." />
          : <div className="space-y-2">{data!.results.map((r) => <ReportPreview key={r.id} report={r} />)}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/reports/ReportPreview.tsx "web/src/app/(dashboard)/reports/page.tsx"
git commit -m "feat: reports list page with download"
```

---

## Task 19: Dashboard home

**Files:**
- Create: `web/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Implement the dashboard home**

Create `web/src/app/(dashboard)/page.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePatients } from '@/hooks/usePatients'
import { useAssessments } from '@/hooks/useAssessments'
import { Card } from '@/components/ui/card'
import { NewPatientDialog } from '@/components/patients/NewPatientDialog'

export default function DashboardPage() {
  const { data: patients } = usePatients('')
  const { data: assessments } = useAssessments()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <NewPatientDialog />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-xs uppercase text-slate-600">Patients</div>
          <div className="text-3xl font-bold tabular-nums">{patients?.count ?? '—'}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-slate-600">Assessments</div>
          <div className="text-3xl font-bold tabular-nums">{assessments?.count ?? '—'}</div></Card>
        <Card className="flex items-center p-5">
          <Link href="/patients" className="text-sm font-medium text-teal-700">View all patients →</Link>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(dashboard)/page.tsx"
git commit -m "feat: dashboard home with counts and quick actions"
```

---

## Task 20: Settings — practice + thresholds

**Files:**
- Create: `web/src/components/settings/ThresholdForm.tsx`
- Create: `web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Threshold form**

Create `web/src/components/settings/ThresholdForm.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { usePractice, useUpdatePractice } from '@/hooks/usePractice'
import { thresholdSchema } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { z } from 'zod'

type Form = z.infer<typeof thresholdSchema>

export function ThresholdForm() {
  const { data: practice } = usePractice()
  const update = useUpdatePractice()
  const { register, handleSubmit } = useForm<Form>({
    resolver: zodResolver(thresholdSchema),
    values: practice ? {
      nibut_normal_threshold: practice.nibut_normal_threshold,
      nibut_borderline_threshold: practice.nibut_borderline_threshold,
    } : undefined,
  })

  return (
    <form onSubmit={handleSubmit((d) => update.mutate(d))} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="n">NIBUT normal (s)</Label><Input id="n" type="number" step="0.1" {...register('nibut_normal_threshold')} /></div>
        <div><Label htmlFor="b">NIBUT borderline (s)</Label><Input id="b" type="number" step="0.1" {...register('nibut_borderline_threshold')} /></div>
      </div>
      <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save thresholds'}
      </Button>
      {update.isSuccess && <p className="text-sm text-status-normal">Saved.</p>}
    </form>
  )
}
```

- [ ] **Step 2: Settings page**

Create `web/src/app/(dashboard)/settings/page.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePractice } from '@/hooks/usePractice'
import { ThresholdForm } from '@/components/settings/ThresholdForm'
import { Card } from '@/components/ui/card'

export default function SettingsPage() {
  const { data: practice } = usePractice()
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{practice?.name}</h2>
        <p className="text-sm text-slate-600">{practice?.address_line_1}, {practice?.city}, {practice?.postcode}</p>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Clinical thresholds</h2>
        <ThresholdForm />
      </Card>
      <Card className="flex items-center justify-between p-5">
        <span className="font-semibold">Clinicians</span>
        <Link href="/settings/clinicians" className="text-sm font-medium text-teal-700">Manage →</Link>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/settings/ThresholdForm.tsx "web/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat: practice settings with editable NIBUT thresholds"
```

---

## Task 21: Clinician admin + invite

**Files:**
- Create: `web/src/components/settings/ClinicianTable.tsx`
- Create: `web/src/components/settings/InviteClinicianDialog.tsx`
- Create: `web/src/app/(dashboard)/settings/clinicians/page.tsx`

- [ ] **Step 1: Clinician table**

Create `web/src/components/settings/ClinicianTable.tsx`:

```tsx
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
        {(data ?? []).map((c) => (
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
```

- [ ] **Step 2: Invite dialog** (shows the returned invite link, since email isn't wired)

Create `web/src/components/settings/InviteClinicianDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteSchema, type InviteInput } from '@/lib/schemas'
import { useInviteClinician } from '@/hooks/usePractice'
import type { ClinicianInviteResult } from '@shared/types/api'

export function InviteClinicianDialog() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ClinicianInviteResult | null>(null)
  const invite = useInviteClinician()
  const { register, handleSubmit, reset } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema), defaultValues: { role: 'clinician' },
  })

  const onSubmit = (data: InviteInput) =>
    invite.mutate(data, { onSuccess: (r) => { setResult(r); reset() } })

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null) }}>
      <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700">Invite clinician</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite clinician</DialogTitle></DialogHeader>
        {result ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Invite created for {result.email}. Share this link:</p>
            <Input readOnly value={result.invite_url} onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="ifn">First name</Label><Input id="ifn" {...register('first_name')} /></div>
              <div><Label htmlFor="iln">Last name</Label><Input id="iln" {...register('last_name')} /></div>
            </div>
            <div><Label htmlFor="iem">Email</Label><Input id="iem" type="email" {...register('email')} /></div>
            <div>
              <Label htmlFor="irole">Role</Label>
              <select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">
                <option value="clinician">Clinician</option>
                <option value="technician">Technician</option>
                <option value="admin">Practice Admin</option>
              </select>
            </div>
            {invite.isError && <p className="text-sm text-status-severe">Could not create invite.</p>}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={invite.isPending}>
              {invite.isPending ? 'Inviting…' : 'Create invite'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Clinician admin page**

Create `web/src/app/(dashboard)/settings/clinicians/page.tsx`:

```tsx
'use client'
import { ClinicianTable } from '@/components/settings/ClinicianTable'
import { InviteClinicianDialog } from '@/components/settings/InviteClinicianDialog'

export default function CliniciansPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Clinicians</h1>
        <InviteClinicianDialog />
      </div>
      <ClinicianTable />
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/settings/ClinicianTable.tsx web/src/components/settings/InviteClinicianDialog.tsx "web/src/app/(dashboard)/settings/clinicians"
git commit -m "feat: clinician admin and invite dialog"
```

---

## Task 22: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all unit + smoke tests pass.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (fix any unused-import/any warnings surfaced).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: compiles; all routes listed.

- [ ] **Step 5: Boot the dev server and eyeball `/login`**

Run: `npm run dev` then open `http://localhost:3000/login`.
Expected: login renders, no console errors. (Dashboard routes redirect to `/login` without a session — correct.)

- [ ] **Step 6: Add `.env.local` and the web README note**

Create `web/.env.local`:

```text
API_URL=http://localhost:8000/api
```

(Server-only; not `NEXT_PUBLIC_*` — the browser never calls Django directly.)

- [ ] **Step 7: Commit**

```bash
git add web/.env.local
git commit -m "chore: web env config and final verification"
```

---

## Self-Review Notes (for the implementer)

- **Shared types:** Task 4 adds `PatientListItem` and `AssessmentListItem` to the existing `patient.ts`/`assessment.ts` (which already export `Patient`, `Assessment`, `TestCapture`, `TestResult`, `DryEyeSeverity`). Don't rename the existing exports.
- **No tokens in the browser:** never add a `NEXT_PUBLIC_API_URL` that the client uses to call Django directly — all traffic goes through the BFF so cookies stay httpOnly.
- **Backend dependency:** report generation and clinician invite require the endpoints from `2026-06-08-backend-additions.md`. Until that's deployed/running, those calls return errors the UI surfaces as error/empty states (acceptable for the contract-first build).
