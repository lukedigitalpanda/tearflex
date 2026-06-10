# Dark Mode / Light Mode Toggle — Design Spec

**Date:** 2026-06-10
**Scope:** Web frontend only (`/opt/tearflex/web`)

---

## Overview

Add a three-way theme dropdown (Light / Dark / System) to the TearFlex web app header. The toggle sits in the top-right header between the clinician name and the Sign out button. Theme is persisted in `localStorage` and defaults to the OS system preference.

---

## Approach

Use `next-themes` to manage the class-based theme toggle. The CSS variable foundation is already in place:

- `tailwind.config.ts` already has `darkMode: ["class"]`
- `globals.css` already defines `:root` (light) and `.dark` (dark) CSS variable blocks
- The body already applies `bg-background text-foreground` via the `@layer base` rule

Work is therefore: (1) install the library, (2) wire up the provider, (3) add the dropdown, (4) replace hardcoded colours with semantic aliases in custom components.

---

## Section 1 — Dependency

Add `next-themes` (latest stable) to `web/package.json` dependencies.

No changes needed to `tailwind.config.ts` or `globals.css` — both are already correctly configured.

---

## Section 2 — ThemeProvider (`src/app/layout.tsx`)

- Import `ThemeProvider` from `next-themes`
- Wrap `QueryProvider` (and therefore all children) with:
  ```tsx
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  ```
- Add `suppressHydrationWarning` to the `<html>` element — next-themes updates the class before React hydrates, which would otherwise trigger a mismatch warning. This attribute silences it for the html element only.
- Remove the hardcoded `bg-slate-50 text-slate-900` from `<body>` — `globals.css` already handles this via `@layer base`.

---

## Section 3 — Header dropdown (`src/components/layout/Header.tsx`)

- Add a theme dropdown between the clinician name and Sign out button.
- Use a shadcn `DropdownMenu` with three items: Light, Dark, System.
- Each item has an icon: `Sun` (Light), `Moon` (Dark), `Monitor` (System) — all from `lucide-react` (already a dependency).
- The dropdown trigger is an icon button showing the current active icon (Sun for light, Moon for dark, Monitor for system). No text label on the trigger to keep the header compact.
- Call `setTheme('light' | 'dark' | 'system')` from `useTheme()` on item click.
- The active theme item shows a checkmark or is visually distinguished.
- The component must remain `'use client'` (already is).

---

## Section 4 — Colour remapping in custom components

Replace hardcoded Tailwind colour classes with semantic CSS variable aliases. No `dark:` prefixes needed — the variables switch automatically.

| File | Remove | Replace with |
|---|---|---|
| `src/components/layout/Sidebar.tsx` | `bg-white` | `bg-card` |
| `src/components/layout/Sidebar.tsx` | `border-slate-300` | `border-border` |
| `src/components/layout/Sidebar.tsx` | `text-slate-600` (inactive nav) | `text-muted-foreground` |
| `src/components/layout/Header.tsx` | `bg-white` | `bg-card` |
| `src/components/layout/Header.tsx` | `border-slate-300` | `border-border` |
| `src/components/layout/Header.tsx` | `text-slate-600` (practice name) | `text-muted-foreground` |
| Any page/card using `bg-white` | `bg-white` | `bg-card` |
| Any page/card using `bg-slate-50` (section bg) | `bg-slate-50` | `bg-background` |
| Any `text-slate-900` headings | `text-slate-900` | `text-foreground` |
| Any `text-slate-600` secondary text | `text-slate-600` | `text-muted-foreground` |
| Any `border-slate-300` dividers | `border-slate-300` | `border-border` |

shadcn/ui components (`Button`, `Dialog`, `Select`, `DropdownMenu`, etc.) already use CSS variables and require no changes.

The full list of files containing hardcoded colours to remap (confirmed via grep):

- `src/app/layout.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/app/(dashboard)/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`
- `src/components/patients/PatientCard.tsx`
- `src/components/patients/PatientProfile.tsx`
- `src/components/patients/TrendChart.tsx`
- `src/components/assessments/ResultsDisplay.tsx`
- `src/components/assessments/TearFilmHeatmap.tsx`
- `src/components/reports/ReportPreview.tsx`
- `src/components/settings/InviteClinicianDialog.tsx`
- `src/components/common/EmptyState.tsx`

---

## Section 5 — Persistence & system preference

`next-themes` handles both automatically:

- User choice is stored in `localStorage` under the key `theme`.
- When set to "System", the theme tracks `prefers-color-scheme` via a `matchMedia` listener.
- On page load, next-themes reads `localStorage` and applies the class before the first paint (via an inline script injected into `<head>`), preventing a flash of unstyled content.

No extra code required.

---

## Colour reference (dark mode values from `globals.css`)

| Variable | Light | Dark |
|---|---|---|
| `--background` | `hsl(0 0% 100%)` white | `hsl(222.2 84% 4.9%)` near-black navy |
| `--card` | `hsl(0 0% 100%)` white | `hsl(222.2 84% 4.9%)` near-black navy |
| `--foreground` | `hsl(222.2 84% 4.9%)` near-black | `hsl(210 40% 98%)` near-white |
| `--muted-foreground` | `hsl(215.4 16.3% 46.9%)` slate-500 | `hsl(215 20.2% 65.1%)` slate-400 |
| `--border` | `hsl(214.3 31.8% 91.4%)` light grey | `hsl(217.2 32.6% 17.5%)` dark slate |

---

## Out of scope

- Mobile app (React Native / Expo) — separate implementation
- Per-user server-side theme preference (localStorage is sufficient)
- Custom dark mode colour overrides for clinical status colours (`status-normal`, `status-mild`, etc.) — these are already well-saturated and work on dark backgrounds
