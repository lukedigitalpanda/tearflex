# Dark Mode / Light Mode Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-way Light / Dark / System theme dropdown to the TearFlex web app header, with full dark mode coverage across all pages and components.

**Architecture:** `next-themes` manages the `.dark` class on `<html>`. A client-component `ThemeProvider` wrapper is inserted in the server-component root layout. A `ThemeToggle` select sits in the header. All hardcoded colour classes across 16 files are replaced with semantic CSS variable aliases that switch automatically.

**Tech Stack:** `next-themes ^0.3.0`, existing `shadcn/ui Select`, `lucide-react` icons, Tailwind CSS class-based dark mode (already configured), existing CSS variable blocks in `globals.css` (already configured).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/components/providers/ThemeProvider.tsx` | Client wrapper for `next-themes` ThemeProvider |
| Create | `src/components/layout/ThemeToggle.tsx` | Light/Dark/System select dropdown |
| Create | `src/components/layout/ThemeToggle.test.tsx` | Unit test for ThemeToggle |
| Modify | `package.json` | Add `next-themes` dependency |
| Modify | `src/app/layout.tsx` | Add ThemeProvider wrapper; remove hardcoded body classes; add `suppressHydrationWarning` |
| Modify | `src/components/layout/Header.tsx` | Add ThemeToggle; remap hardcoded colours |
| Modify | `src/components/layout/Sidebar.tsx` | Remap hardcoded colours |
| Modify | `src/app/(auth)/login/page.tsx` | Remap hardcoded colours |
| Modify | `src/app/(auth)/register/page.tsx` | Remap hardcoded colours |
| Modify | `src/app/(dashboard)/page.tsx` | Remap hardcoded colours |
| Modify | `src/app/(dashboard)/settings/page.tsx` | Remap hardcoded colours |
| Modify | `src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx` | Remap hardcoded colours |
| Modify | `src/components/patients/PatientCard.tsx` | Remap hardcoded colours |
| Modify | `src/components/patients/PatientProfile.tsx` | Remap hardcoded colours |
| Modify | `src/components/patients/TrendChart.tsx` | Remap hardcoded colours; adapt axis stroke for theme |
| Modify | `src/components/assessments/ResultsDisplay.tsx` | Remap hardcoded colours |
| Modify | `src/components/assessments/TearFilmHeatmap.tsx` | Remap hardcoded colours |
| Modify | `src/components/reports/ReportPreview.tsx` | Remap hardcoded colours |
| Modify | `src/components/settings/InviteClinicianDialog.tsx` | Remap hardcoded colours |
| Modify | `src/components/common/EmptyState.tsx` | Remap hardcoded colours |

---

## Task 1: Install next-themes

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Add next-themes to package.json dependencies**

In `/opt/tearflex/web/package.json`, add `"next-themes": "^0.3.0"` to the `dependencies` block (after `"next": "14.2.35"`):

```json
"next": "14.2.35",
"next-themes": "^0.3.0",
```

- [ ] **Step 2: Install the package**

```bash
cd /opt/tearflex/web && npm install
```

Expected: `next-themes` appears in `node_modules/next-themes` with no errors.

- [ ] **Step 3: Verify install**

```bash
node -e "require('next-themes'); console.log('ok')"
```

Expected output: `ok`

---

## Task 2: Create the ThemeProvider client wrapper

**Files:**
- Create: `src/components/providers/ThemeProvider.tsx`

`layout.tsx` is a server component. `next-themes`' `ThemeProvider` is a client component. A thin wrapper isolates the `'use client'` boundary.

- [ ] **Step 1: Create the providers directory and file**

Create `/opt/tearflex/web/src/components/providers/ThemeProvider.tsx`:

```tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/package.json web/package-lock.json web/src/components/providers/ThemeProvider.tsx
git commit -m "feat: install next-themes and add ThemeProvider client wrapper"
```

---

## Task 3: Wire ThemeProvider into the root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update layout.tsx**

Replace the entire file at `/opt/tearflex/web/src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/lib/queryClient'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'TearFlex',
  description: 'Smartphone tear film analysis platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-gb" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Key changes:
- `suppressHydrationWarning` on `<html>` — next-themes sets the `dark` class before React hydrates, which would otherwise cause a hydration mismatch warning. This suppresses it for the html element only.
- `bg-slate-50 text-slate-900` removed from `<body>` — `globals.css` already applies `bg-background text-foreground` to `body` via `@layer base`, which switches automatically with the theme.
- `ThemeProvider` wraps `QueryProvider` so theme context is available throughout.

- [ ] **Step 2: Commit**

```bash
git add web/src/app/layout.tsx
git commit -m "feat: wire ThemeProvider into root layout"
```

---

## Task 4: Create ThemeToggle component and test

**Files:**
- Create: `src/components/layout/ThemeToggle.tsx`
- Create: `src/components/layout/ThemeToggle.test.tsx`

- [ ] **Step 1: Write the failing test first**

Create `/opt/tearflex/web/src/components/layout/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

describe('ThemeToggle', () => {
  it('renders the theme select trigger', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows Light as the current selection when theme is light', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Light')
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd /opt/tearflex/web && npm test -- ThemeToggle
```

Expected: FAIL — `ThemeToggle` not found / cannot resolve module.

- [ ] **Step 3: Create the ThemeToggle component**

Create `/opt/tearflex/web/src/components/layout/ThemeToggle.tsx`:

```tsx
'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme = 'system', setTheme } = useTheme()
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]
  const CurrentIcon = current.Icon

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="h-8 w-28 gap-1.5 text-xs">
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
        <span>{current.label}</span>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map(({ value, label, Icon }) => (
          <SelectItem key={value} value={value}>
            <span className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd /opt/tearflex/web && npm test -- ThemeToggle
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/layout/ThemeToggle.tsx web/src/components/layout/ThemeToggle.test.tsx
git commit -m "feat: add ThemeToggle select component (Light / Dark / System)"
```

---

## Task 5: Add ThemeToggle to Header and remap Header colours

**Files:**
- Modify: `src/components/layout/Header.tsx`

Current content for reference:
```tsx
'use client'
import { useMe, useLogout } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

export function Header() {
  const { data: me } = useMe()
  const logout = useLogout()
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-300 bg-white px-6">
      <div className="text-sm text-slate-600">{me?.clinician.practice.name ?? ''}</div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">{me ? `${me.user.first_name} ${me.user.last_name}` : ''}</span>
        <Button variant="ghost" size="sm"
          onClick={() => logout.mutate(undefined, { onSuccess: () => { window.location.href = '/login' } })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 1: Update Header.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/layout/Header.tsx` with:

```tsx
'use client'
import { useMe, useLogout } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const { data: me } = useMe()
  const logout = useLogout()
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="text-sm text-muted-foreground">{me?.clinician.practice.name ?? ''}</div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{me ? `${me.user.first_name} ${me.user.last_name}` : ''}</span>
        <ThemeToggle />
        <Button variant="ghost" size="sm"
          onClick={() => logout.mutate(undefined, { onSuccess: () => { window.location.href = '/login' } })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
```

Changes:
- `bg-white` → `bg-card`
- `border-slate-300` → `border-border`
- `text-slate-600` → `text-muted-foreground`
- `gap-4` → `gap-3` (ThemeToggle adds a third item, tighter spacing looks better)
- Import and render `ThemeToggle` between clinician name and Sign out

- [ ] **Step 2: Commit**

```bash
git add web/src/components/layout/Header.tsx
git commit -m "feat: add ThemeToggle to header; remap header colours to semantic tokens"
```

---

## Task 6: Remap Sidebar colours

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/layout/Sidebar.tsx` with:

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
    <aside className="w-60 shrink-0 border-r border-border bg-card p-4">
      <div className="mb-8 px-2 text-xl font-bold text-teal-600">TearFlex</div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                active ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300' : 'text-muted-foreground hover:bg-muted')}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

Changes:
- `bg-white` → `bg-card`
- `border-slate-300` → `border-border`
- `text-slate-600` (inactive nav) → `text-muted-foreground`
- `hover:bg-slate-50` → `hover:bg-muted`
- Active state: keep `bg-teal-50 text-teal-700` for light, add `dark:bg-teal-950 dark:text-teal-300` for dark (teal-50 would be invisible on dark background)

Note: `teal-950` and `teal-300` are standard Tailwind colours. If your Tailwind version doesn't include `teal-950`, use `dark:bg-teal-900` instead.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/layout/Sidebar.tsx
git commit -m "feat: remap sidebar colours to semantic tokens"
```

---

## Task 7: Remap auth page colours

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`

Both auth pages use `bg-slate-50` as the full-screen background and `text-slate-600` for secondary text.

- [ ] **Step 1: Update login/page.tsx**

Replace the entire file at `/opt/tearflex/web/src/app/(auth)/login/page.tsx` with:

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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        <p className="mb-6 text-sm text-muted-foreground">Sign in to your practice account</p>
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

Change: `bg-slate-50` → `bg-background`, `text-slate-600` → `text-muted-foreground`.

- [ ] **Step 2: Update register/page.tsx**

Replace the entire file at `/opt/tearflex/web/src/app/(auth)/register/page.tsx` with:

```tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})
type RegisterInput = z.infer<typeof schema>

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing invite link.')
  }, [token])

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: RegisterInput) => {
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.token?.[0] ?? body?.detail ?? 'Registration failed.'
        setError(msg)
        return
      }
      router.push('/')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      {error && <p className="mb-4 rounded bg-destructive/10 p-3 text-sm text-status-severe">{error}</p>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register('password')} />
          {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" {...register('confirm')} />
          {errors.confirm && <p className="mt-1 text-xs text-status-severe">{errors.confirm.message}</p>}
        </div>
        <Button
          type="submit"
          className="w-full bg-teal-600 hover:bg-teal-700"
          disabled={isPending || !token}
        >
          {isPending ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
    </>
  )
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        <p className="mb-6 text-sm text-muted-foreground">Set your password to activate your account</p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <RegisterForm />
        </Suspense>
      </Card>
    </div>
  )
}
```

Changes:
- `bg-slate-50` → `bg-background`
- `text-slate-600` → `text-muted-foreground`
- `bg-red-50` → `bg-destructive/10` (error banner — red-50 is jarring on a dark background; `bg-destructive/10` is a 10% opacity tint of the destructive CSS variable, which works on any background)

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(auth\)/login/page.tsx web/src/app/\(auth\)/register/page.tsx
git commit -m "feat: remap auth page colours to semantic tokens"
```

---

## Task 8: Remap dashboard and assessment pages

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`

These pages use `text-slate-600` for secondary text. The `Card` component from shadcn/ui already uses CSS variables, so card backgrounds switch automatically.

- [ ] **Step 1: Update dashboard page.tsx**

Replace `/opt/tearflex/web/src/app/(dashboard)/page.tsx` with:

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
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Patients</div>
          <div className="text-3xl font-bold tabular-nums">{patients?.count ?? '—'}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Assessments</div>
          <div className="text-3xl font-bold tabular-nums">{assessments?.count ?? '—'}</div></Card>
        <Card className="flex items-center p-5">
          <Link href="/patients" className="text-sm font-medium text-teal-700 dark:text-teal-400">View all patients →</Link>
        </Card>
      </div>
    </div>
  )
}
```

Changes: `text-slate-600` → `text-muted-foreground`; `text-teal-700` → `text-teal-700 dark:text-teal-400` (teal-700 on dark bg is too dark).

- [ ] **Step 2: Update settings/page.tsx**

Replace `/opt/tearflex/web/src/app/(dashboard)/settings/page.tsx` with:

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
        <p className="text-sm text-muted-foreground">{practice?.address_line_1}, {practice?.city}, {practice?.postcode}</p>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Clinical thresholds</h2>
        <ThresholdForm />
      </Card>
      <Card className="flex items-center justify-between p-5">
        <span className="font-semibold">Clinicians</span>
        <Link href="/settings/clinicians" className="text-sm font-medium text-teal-700 dark:text-teal-400">Manage →</Link>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Update assessment detail page**

Replace `/opt/tearflex/web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx` with:

```tsx
'use client'
import { useAssessment } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { ResultsDisplay } from '@/components/assessments/ResultsDisplay'
import { GenerateReportButton } from '@/components/reports/GenerateReportButton'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import type { TestCapture } from '@shared/types/assessment'

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
          <p className="text-sm text-muted-foreground">{assessment.eye} eye · {new Date(assessment.assessed_at).toLocaleString('en-GB')}</p>
        </div>
        <GenerateReportButton assessmentId={assessment.id} />
      </div>

      {assessment.captures.length === 0
        ? <EmptyState title="No captures in this assessment" />
        : assessment.captures.map((c: TestCapture) => (
            <div key={c.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{c.test_type.toUpperCase()}</h2>
              {c.result
                ? <ResultsDisplay result={c.result} thresholds={thresholds} />
                : <EmptyState title="Capture not yet analysed" />}
            </div>
          ))}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/(dashboard)/page.tsx" "web/src/app/(dashboard)/settings/page.tsx" "web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx"
git commit -m "feat: remap dashboard and assessment page colours to semantic tokens"
```

---

## Task 9: Remap patient components

**Files:**
- Modify: `src/components/patients/PatientCard.tsx`
- Modify: `src/components/patients/PatientProfile.tsx`
- Modify: `src/components/patients/TrendChart.tsx`

- [ ] **Step 1: Update PatientCard.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/patients/PatientCard.tsx` with:

```tsx
import Link from 'next/link'
import { StatusBadge } from '@/components/common/StatusBadge'
import type { PatientListItem } from '@shared/types/patient'

export function PatientCard({ patient }: { patient: PatientListItem }) {
  return (
    <Link href={`/patients/${patient.id}`}
      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:border-teal-600">
      <div>
        <div className="font-medium">{patient.full_name}</div>
        <div className="text-xs text-muted-foreground">DOB {patient.date_of_birth}</div>
      </div>
      <StatusBadge severity={patient.latest_severity} />
    </Link>
  )
}
```

Changes: `border-slate-300` → `border-border`, `bg-white` → `bg-card`, `text-slate-600` → `text-muted-foreground`.

- [ ] **Step 2: Update PatientProfile.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/patients/PatientProfile.tsx` with:

```tsx
'use client'
import Link from 'next/link'
import { usePatient, usePatientTrend } from '@/hooks/usePatients'
import { useAssessments } from '@/hooks/useAssessments'
import { usePractice } from '@/hooks/usePractice'
import { TrendChart } from './TrendChart'
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
        <p className="text-sm text-muted-foreground">DOB {patient.date_of_birth} · {patient.nhs_number || 'No NHS number'}</p>
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
                  className="flex items-center justify-between rounded-md border border-border px-4 py-2 hover:border-teal-600">
                  <span className="text-sm">{a.eye} eye · {new Date(a.assessed_at).toLocaleDateString('en-GB')}</span>
                  <span className="text-xs text-muted-foreground">{a.status}</span>
                </Link>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}
```

Changes: `text-slate-600` → `text-muted-foreground`, `border-slate-300` → `border-border`.

- [ ] **Step 3: Update TrendChart.tsx**

`TrendChart` uses inline SVG `stroke` attributes for axis colours. These are hardcoded to `#475569` (slate-600), which is too dark on a dark background. Use `useTheme()` to switch between the correct shade.

Replace the entire file at `/opt/tearflex/web/src/components/patients/TrendChart.tsx` with:

```tsx
'use client'
import { useTheme } from 'next-themes'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'

interface Point { date: string; nibut: number }

export function TrendChart({ data, normal = 10, borderline = 5 }: { data: Point[]; normal?: number; borderline?: number }) {
  const { resolvedTheme } = useTheme()
  const axisColor = resolvedTheme === 'dark' ? '#94a3b8' : '#475569'

  if (data.length === 0) return <p className="text-sm text-muted-foreground">No trend data yet.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke={axisColor} />
        <YAxis tick={{ fontSize: 12 }} stroke={axisColor} unit="s" />
        <Tooltip />
        <ReferenceLine y={normal} stroke="#4ADE80" strokeDasharray="4 4" />
        <ReferenceLine y={borderline} stroke="#FBBF24" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="nibut" stroke="#0E7C7B" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

Changes:
- Import `useTheme` from `next-themes`
- Derive `axisColor`: `#94a3b8` (slate-400) in dark, `#475569` (slate-600) in light
- Use `axisColor` for `XAxis` and `YAxis` `stroke` props
- `text-slate-600` → `text-muted-foreground` on empty state

- [ ] **Step 4: Commit**

```bash
git add web/src/components/patients/PatientCard.tsx web/src/components/patients/PatientProfile.tsx web/src/components/patients/TrendChart.tsx
git commit -m "feat: remap patient component colours to semantic tokens"
```

---

## Task 10: Remap assessment, report, settings, and common components

**Files:**
- Modify: `src/components/assessments/ResultsDisplay.tsx`
- Modify: `src/components/assessments/TearFilmHeatmap.tsx`
- Modify: `src/components/reports/ReportPreview.tsx`
- Modify: `src/components/settings/InviteClinicianDialog.tsx`
- Modify: `src/components/common/EmptyState.tsx`

- [ ] **Step 1: Update ResultsDisplay.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/assessments/ResultsDisplay.tsx` with:

```tsx
import { nibutBand, severityMeta, type NibutThresholds } from '@/lib/severity'
import { TearFilmHeatmap } from './TearFilmHeatmap'
import { Card } from '@/components/ui/card'
import type { TestResult } from '@shared/types/assessment'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  )
}

export function ResultsDisplay({ result, thresholds }: { result: TestResult; thresholds: NibutThresholds }) {
  const band = nibutBand(result.nibut_first_breakup_seconds, thresholds)
  const sev = severityMeta(result.dry_eye_severity)

  return (
    <div className="space-y-4">
      <Card className="p-6" style={{ backgroundColor: `${band.color}18` }}>
        <div className="text-xs uppercase text-muted-foreground">NIBUT — first break-up</div>
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

Change: `text-slate-600` → `text-muted-foreground` in the `Metric` component and NIBUT label.

- [ ] **Step 2: Update TearFilmHeatmap.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/assessments/TearFilmHeatmap.tsx` with:

```tsx
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
```

Changes: `bg-slate-50` → `bg-muted`, `text-slate-600` → `text-muted-foreground`.

- [ ] **Step 3: Update ReportPreview.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/reports/ReportPreview.tsx` with:

```tsx
import { downloadReportUrl } from '@/hooks/useReports'
import { Button } from '@/components/ui/button'
import type { Report } from '@shared/types/api'

export function ReportPreview({ report }: { report: Report }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="font-medium">Assessment #{report.assessment}</div>
        <div className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString('en-GB')} · {report.status}</div>
      </div>
      <Button variant="outline" size="sm" disabled={report.status !== 'ready'}
        onClick={() => window.open(downloadReportUrl(report.id), '_blank')}>
        Download
      </Button>
    </div>
  )
}
```

Changes: `border-slate-300` → `border-border`, `bg-white` → `bg-card`, `text-slate-600` → `text-muted-foreground`.

- [ ] **Step 4: Update InviteClinicianDialog.tsx**

Replace only the `<select>` element's className in `/opt/tearflex/web/src/components/settings/InviteClinicianDialog.tsx`.

Find:
```tsx
<select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">
```

Replace with:
```tsx
<select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
```

Changes: `border-slate-300` → `border-border`, add `bg-background text-foreground` (native `<select>` doesn't inherit these automatically in dark mode).

- [ ] **Step 5: Update EmptyState.tsx**

Replace the entire file at `/opt/tearflex/web/src/components/common/EmptyState.tsx` with:

```tsx
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
```

Changes: `border-slate-300` → `border-border`, `text-slate-600` → `text-muted-foreground`.

- [ ] **Step 6: Run the full test suite to check nothing is broken**

```bash
cd /opt/tearflex/web && npm test
```

Expected: all existing tests pass. If any test imports reference `text-slate-600` or `bg-white` in snapshots/assertions, update them to the new class names.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/assessments/ResultsDisplay.tsx web/src/components/assessments/TearFilmHeatmap.tsx web/src/components/reports/ReportPreview.tsx web/src/components/settings/InviteClinicianDialog.tsx web/src/components/common/EmptyState.tsx
git commit -m "feat: remap remaining component colours to semantic tokens"
```

---

## Task 11: Rebuild and deploy

- [ ] **Step 1: Rebuild the web container**

```bash
cd /opt/tearflex && docker-compose -f docker-compose.prod.yml build web
```

This installs `next-themes` via `npm ci` inside the container and builds the Next.js app. Expected: build completes with no TypeScript or module errors.

- [ ] **Step 2: Restart the web container**

```bash
docker-compose -f docker-compose.prod.yml up -d web
```

- [ ] **Step 3: Verify the toggle is live**

Open the app in a browser. Confirm:
1. A theme dropdown appears in the header between clinician name and Sign out.
2. Selecting "Dark" turns the sidebar, header, and page backgrounds dark.
3. Selecting "Light" restores light mode.
4. Selecting "System" follows the OS preference.
5. Refreshing the page preserves the selected theme (persisted in localStorage).
6. The trend chart axis labels are visible in dark mode (should be light grey, not dark).
