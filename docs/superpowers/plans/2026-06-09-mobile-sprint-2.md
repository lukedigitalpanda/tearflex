# TearFlex Mobile Sprint 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete TearFlex React Native mobile app as a shippable vertical slice: auth → patient list → capture flow → video upload → results display.

**Architecture:** Expo SDK 52 + expo-dev-client, NativeWind 4, Expo Router v3 (file-based routing). JWT tokens stored in expo-secure-store; a `lib/api.ts` client attaches Bearer headers and silently refreshes on 401. Expo Router's root layout reads SecureStore on mount and redirects unauthenticated users to login. Assessment capture uses expo-camera with a simulated 2 s alignment delay (swap point clearly marked). Video upload uses React Native's native `FormData` + `fetch`. Results are polled via TanStack Query `refetchInterval`.

**Tech Stack:** React Native 0.76, Expo SDK 52, TypeScript, NativeWind 4, Expo Router v3, TanStack Query v5, Zustand v5, React Hook Form + Zod, expo-camera, expo-secure-store, expo-file-system, expo-device, react-native-svg.

---

## Prerequisites

- Node 18+ and npm available.
- Xcode installed (for iOS simulator / device build).
- Android Studio installed with an emulator or physical device connected (for Android).
- All commands run from `mobile/` unless stated.
- Backend is deployed at `https://tearflex.mydryeyeapp.co.uk`.
- Run `docker-compose up -d` in `backend/` if running backend tests locally.

---

## File Map

| File | Responsibility |
|---|---|
| `backend/apps/assessments/views.py` | Fix: add `permission_classes` + practice scoping to `CaptureUploadView` and `CaptureDetailView` |
| `backend/apps/assessments/tests/test_capture_views.py` | Tests for the upload fix |
| `mobile/app.json` | Expo config, scheme, camera permission, apiUrl extra |
| `mobile/package.json` | Dependencies + scripts |
| `mobile/tsconfig.json` | Strict TS + `@/*` and `@shared/*` path aliases |
| `mobile/tailwind.config.js` | NativeWind preset + TearFlex design tokens |
| `mobile/babel.config.js` | Expo preset with NativeWind jsxImportSource |
| `mobile/metro.config.js` | withNativeWind wrapper |
| `mobile/global.css` | Tailwind directives entry for NativeWind |
| `mobile/nativewind-env.d.ts` | TypeScript className prop declaration |
| `mobile/lib/secureTokens.ts` | expo-secure-store read/write/clear helpers |
| `mobile/lib/api.ts` | Authed fetch client: Bearer inject, 401 refresh retry, postMultipart |
| `mobile/store/auth.ts` | Zustand: `me`, `isAuthenticated`, `setMe`, `setAuthenticated`, `clear` |
| `mobile/hooks/useAuth.ts` | `useLogin`, `useLogout`, `useMe` |
| `mobile/hooks/usePatients.ts` | `usePatients`, `usePatient`, `usePatientTrend` |
| `mobile/hooks/useAssessments.ts` | `useAssessments`, `useCreateAssessment` |
| `mobile/hooks/useCapture.ts` | Upload state machine + postMultipart call |
| `mobile/constants/colours.ts` | Clinical colour palette |
| `mobile/components/common/StatusBadge.tsx` | Severity pill component |
| `mobile/components/common/LoadingState.tsx` | Skeleton rows |
| `mobile/components/common/EmptyState.tsx` | Dashed empty box |
| `mobile/components/patients/PatientCard.tsx` | Patient row with severity badge |
| `mobile/components/patients/PatientList.tsx` | FlatList wrapper |
| `mobile/components/patients/TrendChart.tsx` | SVG NIBUT trend line (react-native-svg) |
| `mobile/components/capture/AlignmentOverlay.tsx` | Animated circular alignment ring |
| `mobile/components/capture/CaptureButton.tsx` | State-driven shutter/stop button |
| `mobile/components/capture/StatePrompt.tsx` | Bottom prompt text |
| `mobile/components/capture/TimerDisplay.tsx` | Recording elapsed timer |
| `mobile/components/results/NIBUTResult.tsx` | Headline NIBUT card |
| `mobile/components/results/MetricsGrid.tsx` | 2-col secondary metrics |
| `mobile/app/_layout.tsx` | Root Stack + QueryClient + auth redirect |
| `mobile/app/(auth)/_layout.tsx` | Auth Stack |
| `mobile/app/(auth)/login.tsx` | Login form |
| `mobile/app/(tabs)/_layout.tsx` | Bottom tab bar |
| `mobile/app/(tabs)/index.tsx` | Patient list screen |
| `mobile/app/(tabs)/settings.tsx` | Settings stub |
| `mobile/app/patient/[id].tsx` | Patient profile + trend + assessment list |
| `mobile/app/assessment/select-test.tsx` | Eye + test type picker → creates Assessment |
| `mobile/app/assessment/instructions.tsx` | Pre-capture instructions |
| `mobile/app/assessment/capture.tsx` | Full-screen camera with state machine |
| `mobile/app/assessment/processing.tsx` | Upload progress + analysis poller |
| `mobile/app/assessment/results.tsx` | Results display |

---

## Task 1: Fix CaptureUploadView — practice scoping + permission_classes

**Files:**
- Modify: `backend/apps/assessments/views.py`
- Create: `backend/apps/assessments/tests/__init__.py`
- Create: `backend/apps/assessments/tests/test_capture_views.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/assessments/tests/__init__.py` (empty).

Create `backend/apps/assessments/tests/test_capture_views.py`:

```python
import io
import pytest
from rest_framework.test import APIClient
from conftest import AssessmentFactory, ClinicianFactory, PatientFactory


@pytest.mark.django_db
def test_unauthenticated_upload_is_rejected():
    assessment = AssessmentFactory()
    client = APIClient()
    resp = client.post('/api/assessments/captures/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'video_file': io.BytesIO(b'fake'),
    }, format='multipart')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_upload_for_other_practice_is_rejected(api, clinician):
    other_patient = PatientFactory()  # different practice
    other_assessment = AssessmentFactory(patient=other_patient)
    resp = api.post('/api/assessments/captures/', {
        'assessment': other_assessment.id,
        'test_type': 'nibut',
        'video_file': io.BytesIO(b'fake'),
    }, format='multipart')
    assert resp.status_code in (403, 404)


@pytest.mark.django_db
def test_unauthenticated_detail_is_rejected():
    from conftest import AssessmentFactory
    from apps.assessments.models import TestCapture
    assessment = AssessmentFactory()
    capture = TestCapture.objects.create(
        assessment=assessment, test_type='nibut',
        video_file='captures/test.mp4',
    )
    client = APIClient()
    resp = client.get(f'/api/assessments/captures/{capture.id}/')
    assert resp.status_code == 401
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend
pytest apps/assessments/tests/test_capture_views.py -v
```

Expected: `test_unauthenticated_upload_is_rejected` FAILS (returns 200/400, not 401); others may also fail.

- [ ] **Step 3: Fix `CaptureUploadView` and `CaptureDetailView`**

Replace the two classes in `backend/apps/assessments/views.py`:

```python
class CaptureUploadView(generics.CreateAPIView):
    """Upload a video capture for analysis."""
    serializer_class = TestCaptureUploadSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        practice = self.request.user.clinician.practice
        assessment = serializer.validated_data['assessment']
        if assessment.patient.practice_id != practice.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied()
        capture = serializer.save()
        task = process_capture.delay(capture.id)
        capture.celery_task_id = task.id
        capture.status = 'processing'
        capture.save()


class CaptureDetailView(generics.RetrieveAPIView):
    serializer_class = TestCaptureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        practice = self.request.user.clinician.practice
        return TestCapture.objects.filter(assessment__patient__practice=practice)
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pytest apps/assessments/tests/test_capture_views.py -v
```

Expected: all 3 PASS.

- [ ] **Step 5: Run full backend suite**

```bash
pytest -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/assessments/views.py backend/apps/assessments/tests/
git commit -m "fix: CaptureUploadView practice scoping and explicit permission_classes"
```

---

## Task 2: Scaffold mobile project

**Files:** all config files in `mobile/`

- [ ] **Step 1: Create `mobile/package.json`**

```json
{
  "name": "tearflex-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.17",
    "expo-camera": "~16.0.18",
    "expo-secure-store": "~14.0.1",
    "expo-file-system": "~18.0.11",
    "expo-device": "~7.0.1",
    "expo-dev-client": "~4.0.29",
    "expo-status-bar": "~2.0.1",
    "expo-constants": "~17.0.8",
    "expo-linking": "~7.0.4",
    "react": "18.3.2",
    "react-native": "0.76.9",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-svg": "~15.9.0",
    "nativewind": "^4.1.23",
    "tailwindcss": "3.4.15",
    "@tanstack/react-query": "^5.62.7",
    "zustand": "^5.0.2",
    "react-hook-form": "^7.53.2",
    "@hookform/resolvers": "^3.9.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/react": "~18.3.12",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create `mobile/app.json`**

```json
{
  "expo": {
    "name": "TearFlex",
    "slug": "tearflex",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "scheme": "tearflex",
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "co.uk.digital-panda.tearflex"
    },
    "android": {
      "package": "co.uk.digitalpanda.tearflex",
      "adaptiveIcon": {
        "backgroundColor": "#0E7C7B"
      }
    },
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "TearFlex needs camera access to record tear film videos."
        }
      ],
      "expo-router",
      "expo-secure-store"
    ],
    "extra": {
      "apiUrl": "https://tearflex.mydryeyeapp.co.uk/api",
      "router": {}
    }
  }
}
```

- [ ] **Step 3: Create `mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"],
      "@shared/*": ["../shared/*"]
    }
  }
}
```

- [ ] **Step 4: Create `mobile/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        teal: { 50: '#EFFEFE', 600: '#0E7C7B', 700: '#0A5E5D' },
        coral: { 500: '#F97066' },
        status: {
          normal: '#4ADE80',
          mild: '#FBBF24',
          moderate: '#FB923C',
          severe: '#F87171',
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
  };
};
```

- [ ] **Step 6: Create `mobile/metro.config.js`**

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: './global.css' });
```

- [ ] **Step 7: Create `mobile/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `mobile/nativewind-env.d.ts`**

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 9: Install dependencies**

```bash
npm install
```

Expected: installs without errors. Ignore any optional peer dep warnings about `react-native-reanimated` — not needed this sprint.

- [ ] **Step 10: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes (no source files yet, so just checks config).

- [ ] **Step 11: Commit**

```bash
git add mobile/
git commit -m "chore: scaffold Expo mobile app (SDK 52, NativeWind 4, Expo Router)"
```

---

## Task 3: SecureStore helpers + API client

**Files:**
- Create: `mobile/lib/secureTokens.ts`
- Create: `mobile/lib/api.ts`

No unit tests — SecureStore is a native module requiring a device/emulator. The API client is tested implicitly through real device usage.

- [ ] **Step 1: Create `mobile/lib/secureTokens.ts`**

```typescript
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'tf_access';
const REFRESH_KEY = 'tf_refresh';

export async function getTokens(): Promise<{ access: string | null; refresh: string | null }> {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { access, refresh };
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
```

- [ ] **Step 2: Create `mobile/lib/api.ts`**

```typescript
import Constants from 'expo-constants';
import { getTokens, setTokens, clearTokens } from './secureTokens';

export const API_BASE: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ??
  'https://tearflex.mydryeyeapp.co.uk/api';

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
    this.name = 'ApiError';
  }
}

export class AuthExpiredError extends Error {
  name = 'AuthExpiredError';
}

async function makeRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const { access, refresh } = await getTokens();

  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
  });

  if (res.status === 401 && retry && refresh) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });

    if (!refreshRes.ok) {
      await clearTokens();
      throw new AuthExpiredError('Session expired');
    }

    const { access: newAccess, refresh: newRefresh } = await refreshRes.json() as {
      access: string;
      refresh: string;
    };
    await setTokens(newAccess, newRefresh);
    return makeRequest<T>(path, init, false);
  }

  if (res.status === 401) {
    await clearTokens();
    throw new AuthExpiredError('Session expired');
  }

  const ct = res.headers.get('content-type') ?? '';
  const body: unknown = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => makeRequest<T>(path, { method: 'GET' }),

  post: <T>(path: string, data?: unknown) =>
    makeRequest<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data ?? {}),
    }),

  patch: <T>(path: string, data?: unknown) =>
    makeRequest<T>(path, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data ?? {}),
    }),

  postMultipart: async <T>(
    path: string,
    fields: Record<string, string>,
    file: { uri: string; name: string; type: string },
  ): Promise<T> => {
    const { access } = await getTokens();
    const formData = new FormData();
    Object.entries(fields).forEach(([key, val]) => formData.append(key, val));
    // React Native FormData accepts { uri, name, type } objects directly
    formData.append('video_file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);

    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      body: formData,
      // Do NOT set Content-Type — fetch sets it automatically with the boundary
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      throw new ApiError(res.status, body.detail ?? `Upload failed (${res.status})`);
    }

    return res.json() as Promise<T>;
  },
};

export async function loginRequest(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new ApiError(res.status, 'Invalid credentials');
  const { access, refresh } = await res.json() as { access: string; refresh: string };
  await setTokens(access, refresh);
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/
git commit -m "feat: SecureStore token helpers and API client with silent refresh"
```

---

## Task 4: Auth store

**Files:**
- Create: `mobile/store/auth.ts`

- [ ] **Step 1: Create `mobile/store/auth.ts`**

```typescript
import { create } from 'zustand';
import type { Me } from '@shared/types/user';

interface AuthState {
  me: Me | null;
  isAuthenticated: boolean;
  setMe: (me: Me) => void;
  setAuthenticated: (v: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  me: null,
  isAuthenticated: false,
  setMe: (me) => set({ me, isAuthenticated: true }),
  setAuthenticated: (v) => set({ isAuthenticated: v }),
  clear: () => set({ me: null, isAuthenticated: false }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add mobile/store/
git commit -m "feat: Zustand auth store"
```

---

## Task 5: Data hooks

**Files:**
- Create: `mobile/hooks/useAuth.ts`
- Create: `mobile/hooks/usePatients.ts`
- Create: `mobile/hooks/useAssessments.ts`

- [ ] **Step 1: Create `mobile/hooks/useAuth.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, loginRequest } from '@/lib/api';
import { clearTokens } from '@/lib/secureTokens';
import { useAuthStore } from '@/store/auth';
import type { Me } from '@shared/types/user';

export function useMe() {
  const setMe = useAuthStore((s) => s.setMe);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api.get<Me>('auth/me/');
      setMe(me);
      return me;
    },
  });
}

export function useLogin() {
  const setMe = useAuthStore((s) => s.setMe);
  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      await loginRequest(username, password);
      return api.get<Me>('auth/me/');
    },
    onSuccess: (me) => setMe(me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: clearTokens,
    onSuccess: () => {
      clear();
      qc.clear();
    },
  });
}
```

- [ ] **Step 2: Create `mobile/hooks/usePatients.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated } from '@shared/types/api';
import type { Patient, PatientListItem } from '@shared/types/patient';

export function usePatients(search = '', page = 1) {
  const qs = new URLSearchParams({ page: String(page) });
  if (search) qs.set('search', search);
  return useQuery({
    queryKey: ['patients', search, page],
    queryFn: () => api.get<Paginated<PatientListItem>>(`patients/?${qs.toString()}`),
  });
}

export function usePatient(id: number) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get<Patient>(`patients/${id}/`),
    enabled: !!id,
  });
}

export function usePatientTrend(id: number) {
  return useQuery({
    queryKey: ['patient-trend', id],
    queryFn: () => api.get<{ date: string; nibut: number }[]>(`patients/${id}/trend/`),
    enabled: !!id,
  });
}
```

- [ ] **Step 3: Create `mobile/hooks/useAssessments.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated } from '@shared/types/api';
import type { Assessment, AssessmentListItem } from '@shared/types/assessment';
import type { Eye } from '@shared/types/assessment';

export function useAssessments(params: { patient?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.patient) qs.set('patient', String(params.patient));
  return useQuery({
    queryKey: ['assessments', params],
    queryFn: () => api.get<Paginated<AssessmentListItem>>(`assessments/?${qs.toString()}`),
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { patient: number; eye: Eye }) =>
      api.post<Assessment>('assessments/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  });
}
```

- [ ] **Step 4: Create `mobile/hooks/useCapture.ts`**

```typescript
import { useState } from 'react';
import * as Device from 'expo-device';
import { api } from '@/lib/api';
import type { TestType } from '@shared/types/assessment';

export type CapturePhase = 'idle' | 'uploading' | 'polling' | 'error';

export function useCapture() {
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [captureId, setCaptureId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(params: {
    assessmentId: number;
    testType: TestType;
    videoUri: string;
  }) {
    setPhase('uploading');
    setError(null);
    try {
      const result = await api.postMultipart<{ id: number; status: string }>(
        'assessments/captures/',
        {
          assessment: String(params.assessmentId),
          test_type: params.testType,
          device_model: Device.modelName ?? '',
        },
        { uri: params.videoUri, name: 'capture.mp4', type: 'video/mp4' },
      );
      setCaptureId(result.id);
      setPhase('polling');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Check your connection.');
      setPhase('error');
    }
  }

  function reset() {
    setPhase('idle');
    setCaptureId(null);
    setError(null);
  }

  return { phase, captureId, error, upload, reset };
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add mobile/hooks/
git commit -m "feat: data hooks (auth, patients, assessments, capture upload)"
```

---

## Task 6: Root layout + auth guard + login screen

**Files:**
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/(auth)/_layout.tsx`
- Create: `mobile/app/(auth)/login.tsx`

- [ ] **Step 1: Create `mobile/app/_layout.tsx`**

```tsx
import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getTokens } from '@/lib/secureTokens';
import { useAuthStore } from '@/store/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="patient/[id]" />
          <Stack.Screen name="assessment/select-test" />
          <Stack.Screen name="assessment/instructions" />
          <Stack.Screen name="assessment/capture" />
          <Stack.Screen name="assessment/processing" />
          <Stack.Screen name="assessment/results" />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const segments = useSegments();
  const router = useRouter();

  // On mount: read SecureStore to determine initial auth state
  useEffect(() => {
    getTokens().then(({ refresh }) => {
      setAuthenticated(!!refresh);
      setReady(true);
    });
  }, []);

  // Redirect whenever auth state or route changes
  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/');
    }
  }, [ready, isAuthenticated, segments]);

  if (!ready) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2: Create `mobile/app/(auth)/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Create `mobile/app/(auth)/login.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLogin } from '@/hooks/useAuth';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  function handleLogin() {
    if (!username || !password) return;
    login.mutate({ username, password });
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50 items-center justify-center px-6"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="w-full max-w-sm">
        <Text className="text-3xl font-bold text-teal-600 mb-1">TearFlex</Text>
        <Text className="text-sm text-slate-600 mb-8">Sign in to your practice account</Text>

        <Text className="text-sm font-medium text-slate-900 mb-1">Username</Text>
        <TextInput
          className="bg-white border border-slate-300 rounded-lg px-3 py-3 text-slate-900 mb-4"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          placeholder="username"
          placeholderTextColor="#94a3b8"
        />

        <Text className="text-sm font-medium text-slate-900 mb-1">Password</Text>
        <TextInput
          className="bg-white border border-slate-300 rounded-lg px-3 py-3 text-slate-900 mb-6"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          placeholder="password"
          placeholderTextColor="#94a3b8"
        />

        {login.isError && (
          <Text className="text-status-severe text-sm mb-4 text-center">
            Invalid username or password.
          </Text>
        )}

        <TouchableOpacity
          className="bg-teal-600 rounded-lg py-3 items-center"
          onPress={handleLogin}
          disabled={login.isPending}
          activeOpacity={0.8}
        >
          {login.isPending
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/
git commit -m "feat: root layout with auth guard and login screen"
```

---

## Task 7: Common components + colour constants

**Files:**
- Create: `mobile/constants/colours.ts`
- Create: `mobile/components/common/StatusBadge.tsx`
- Create: `mobile/components/common/LoadingState.tsx`
- Create: `mobile/components/common/EmptyState.tsx`

- [ ] **Step 1: Create `mobile/constants/colours.ts`**

```typescript
export const colours = {
  teal600: '#0E7C7B',
  teal700: '#0A5E5D',
  teal50: '#EFFEFE',
  slate900: '#0F172A',
  slate600: '#475569',
  slate300: '#CBD5E1',
  slate50: '#F8FAFC',
  coral500: '#F97066',
  statusNormal: '#4ADE80',
  statusMild: '#FBBF24',
  statusModerate: '#FB923C',
  statusSevere: '#F87171',
  statusUnknown: '#CBD5E1',
} as const;

export type Severity = 'normal' | 'mild' | 'moderate' | 'severe';

export function severityColour(s: Severity | null | undefined): string {
  switch (s) {
    case 'normal': return colours.statusNormal;
    case 'mild': return colours.statusMild;
    case 'moderate': return colours.statusModerate;
    case 'severe': return colours.statusSevere;
    default: return colours.statusUnknown;
  }
}

export function severityLabel(s: Severity | null | undefined): string {
  if (!s) return 'Not assessed';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface NibutThresholds { normal: number; borderline: number }

export function nibutColour(seconds: number | null | undefined, t: NibutThresholds): string {
  if (seconds == null) return colours.statusUnknown;
  if (seconds >= t.normal) return colours.statusNormal;
  if (seconds >= t.borderline) return colours.statusMild;
  return colours.statusSevere;
}
```

- [ ] **Step 2: Create `mobile/components/common/StatusBadge.tsx`**

```tsx
import { View, Text } from 'react-native';
import { severityColour, severityLabel, type Severity } from '@/constants/colours';

export function StatusBadge({ severity }: { severity: Severity | null | undefined }) {
  const color = severityColour(severity);
  const label = severityLabel(severity);
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${color}22`,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
      gap: 6,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: '500', color }}>{label}</Text>
    </View>
  );
}
```

- [ ] **Step 3: Create `mobile/components/common/LoadingState.tsx`**

```tsx
import { View } from 'react-native';

function SkeletonRow({ height = 56 }: { height?: number }) {
  return (
    <View style={{ height, backgroundColor: '#E2E8F0', borderRadius: 8, marginBottom: 8 }} />
  );
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <View className="px-0">
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </View>
  );
}
```

- [ ] **Step 4: Create `mobile/components/common/EmptyState.tsx`**

```tsx
import { View, Text } from 'react-native';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="border border-dashed border-slate-300 rounded-xl p-10 items-center">
      <Text className="font-medium text-slate-600 text-center">{title}</Text>
      {hint && <Text className="text-sm text-slate-400 text-center mt-1">{hint}</Text>}
    </View>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add mobile/constants/ mobile/components/common/
git commit -m "feat: colour utilities and common components (StatusBadge, LoadingState, EmptyState)"
```

---

## Task 8: Tab shell

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/app/(tabs)/settings.tsx`

- [ ] **Step 1: Create `mobile/app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from 'expo-router';
import { Users, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0E7C7B',
        tabBarInactiveTintColor: '#475569',
        tabBarStyle: { borderTopColor: '#CBD5E1' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

Note: `lucide-react-native` must be installed. Add to package.json dependencies:

```bash
npm install lucide-react-native
```

- [ ] **Step 2: Create `mobile/app/(tabs)/settings.tsx`**

```tsx
import { View, Text } from 'react-native';
import { useMe } from '@/hooks/useAuth';

export default function SettingsScreen() {
  const { data: me } = useMe();
  return (
    <View className="flex-1 bg-slate-50 px-4 pt-14">
      <Text className="text-xl font-bold text-slate-900 mb-2">Settings</Text>
      {me && (
        <View className="bg-white rounded-xl border border-slate-300 p-4">
          <Text className="font-semibold text-slate-900">{me.clinician.practice.name}</Text>
          <Text className="text-sm text-slate-600 mt-0.5">{me.user.first_name} {me.user.last_name}</Text>
          <Text className="text-xs text-slate-400 mt-0.5 capitalize">{me.clinician.role}</Text>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/(tabs)/
git commit -m "feat: tab shell (Patients + Settings tabs)"
```

---

## Task 9: Patient list screen

**Files:**
- Create: `mobile/components/patients/PatientCard.tsx`
- Create: `mobile/components/patients/PatientList.tsx`
- Create: `mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Create `mobile/components/patients/PatientCard.tsx`**

```tsx
import { TouchableOpacity, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { PatientListItem } from '@shared/types/patient';

export function PatientCard({ patient }: { patient: PatientListItem }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      className="bg-white border border-slate-300 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
      onPress={() => router.push(`/patient/${patient.id}`)}
      activeOpacity={0.7}
    >
      <View className="flex-1 mr-3">
        <Text className="font-medium text-slate-900">{patient.full_name}</Text>
        <Text className="text-xs text-slate-600 mt-0.5">DOB {patient.date_of_birth}</Text>
      </View>
      <StatusBadge severity={patient.latest_severity} />
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Create `mobile/components/patients/PatientList.tsx`**

```tsx
import { FlatList } from 'react-native';
import { PatientCard } from './PatientCard';
import { EmptyState } from '@/components/common/EmptyState';
import type { PatientListItem } from '@shared/types/patient';

export function PatientList({ patients }: { patients: PatientListItem[] }) {
  if (patients.length === 0) {
    return <EmptyState title="No patients found" hint="Patients are added via the web app." />;
  }
  return (
    <FlatList
      data={patients}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => <PatientCard patient={item} />}
      showsVerticalScrollIndicator={false}
    />
  );
}
```

- [ ] **Step 3: Create `mobile/app/(tabs)/index.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePatients } from '@/hooks/usePatients';
import { PatientList } from '@/components/patients/PatientList';
import { LoadingState } from '@/components/common/LoadingState';

export default function PatientsScreen() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { data, isLoading } = usePatients(debouncedSearch);

  function handleSearch(text: string) {
    setSearch(text);
    clearTimeout((handleSearch as { timer?: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(
      () => setDebouncedSearch(text), 300,
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-slate-900 mb-3">Patients</Text>
        <TextInput
          className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900"
          value={search}
          onChangeText={handleSearch}
          placeholder="Search patients…"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      <View className="flex-1 px-4">
        {isLoading
          ? <LoadingState />
          : <PatientList patients={data?.results ?? []} />}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/patients/PatientCard.tsx mobile/components/patients/PatientList.tsx mobile/app/(tabs)/index.tsx
git commit -m "feat: patient list screen with search"
```

---

## Task 10: Patient profile + trend chart

**Files:**
- Create: `mobile/components/patients/TrendChart.tsx`
- Create: `mobile/app/patient/[id].tsx`

- [ ] **Step 1: Create `mobile/components/patients/TrendChart.tsx`**

The chart uses `react-native-svg` directly. No extra charting library needed.

```tsx
import { useWindowDimensions, View, Text } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

interface Point { date: string; nibut: number }

const PAD = { top: 12, right: 12, bottom: 36, left: 38 };

export function TrendChart({
  data,
  normal = 10,
  borderline = 5,
}: {
  data: Point[];
  normal?: number;
  borderline?: number;
}) {
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = 160;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (data.length === 0) {
    return (
      <View className="h-24 items-center justify-center">
        <Text className="text-sm text-slate-600">No trend data yet.</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.nibut), normal + 3);
  const toY = (val: number) => PAD.top + innerH - (val / maxVal) * innerH;
  const toX = (i: number) =>
    PAD.left + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);

  const polyPoints = data.map((d, i) => `${toX(i)},${toY(d.nibut)}`).join(' ');

  return (
    <Svg width={W} height={H}>
      {/* Normal threshold reference line */}
      <Line
        x1={PAD.left} x2={W - PAD.right}
        y1={toY(normal)} y2={toY(normal)}
        stroke="#4ADE80" strokeWidth={1} strokeDasharray="4 3"
      />
      <SvgText x={PAD.left - 4} y={toY(normal) + 4} fontSize={9} fill="#475569" textAnchor="end">
        {normal}s
      </SvgText>

      {/* Borderline threshold reference line */}
      <Line
        x1={PAD.left} x2={W - PAD.right}
        y1={toY(borderline)} y2={toY(borderline)}
        stroke="#FBBF24" strokeWidth={1} strokeDasharray="4 3"
      />
      <SvgText x={PAD.left - 4} y={toY(borderline) + 4} fontSize={9} fill="#475569" textAnchor="end">
        {borderline}s
      </SvgText>

      {/* Data line */}
      {data.length > 1 && (
        <Polyline points={polyPoints} fill="none" stroke="#0E7C7B" strokeWidth={2} />
      )}

      {/* Data points + x labels */}
      {data.map((d, i) => (
        <React.Fragment key={i}>
          <Circle cx={toX(i)} cy={toY(d.nibut)} r={3} fill="#0E7C7B" />
          {(i === 0 || i === data.length - 1) && (
            <SvgText
              x={toX(i)} y={H - PAD.bottom + 14}
              fontSize={9} fill="#475569" textAnchor="middle"
            >
              {d.date.slice(0, 5)}
            </SvgText>
          )}
        </React.Fragment>
      ))}
    </Svg>
  );
}
```

Add `import React from 'react';` at the top (required for `React.Fragment`).

- [ ] **Step 2: Create `mobile/app/patient/[id].tsx`**

```tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePatient, usePatientTrend } from '@/hooks/usePatients';
import { useAssessments } from '@/hooks/useAssessments';
import { useMe } from '@/hooks/useAuth';
import { TrendChart } from '@/components/patients/TrendChart';
import { StatusBadge } from '@/components/common/StatusBadge';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { colours } from '@/constants/colours';

export default function PatientProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = Number(id);
  const router = useRouter();

  const { data: patient, isLoading } = usePatient(patientId);
  const { data: trend } = usePatientTrend(patientId);
  const { data: assessments } = useAssessments({ patient: patientId });
  const { data: me } = useMe();

  const thresholds = {
    normal: me?.clinician.practice.nibut_normal_threshold ?? 10,
    borderline: me?.clinician.practice.nibut_borderline_threshold ?? 5,
  };

  if (isLoading || !patient) return (
    <SafeAreaView className="flex-1 bg-slate-50 px-4 pt-4">
      <LoadingState rows={5} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center mb-4 pt-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-2xl font-bold text-slate-900">{patient.full_name}</Text>
        <Text className="text-sm text-slate-600 mt-0.5">
          DOB {patient.date_of_birth} · {patient.nhs_number || 'No NHS number'}
        </Text>

        {/* NIBUT trend card */}
        <View className="bg-white border border-slate-300 rounded-xl p-4 mt-4">
          <Text className="font-semibold text-slate-900 mb-3">NIBUT trend</Text>
          <TrendChart
            data={trend ?? []}
            normal={thresholds.normal}
            borderline={thresholds.borderline}
          />
        </View>

        {/* New assessment button */}
        <TouchableOpacity
          className="bg-teal-600 rounded-xl py-3 items-center mt-4"
          activeOpacity={0.8}
          onPress={() =>
            router.push({ pathname: '/assessment/select-test', params: { patientId: id } })
          }
        >
          <Text className="text-white font-semibold text-base">New assessment</Text>
        </TouchableOpacity>

        {/* Assessment history */}
        <View className="bg-white border border-slate-300 rounded-xl p-4 mt-4 mb-8">
          <Text className="font-semibold text-slate-900 mb-3">Assessments</Text>
          {(assessments?.results.length ?? 0) === 0 ? (
            <EmptyState title="No assessments yet" />
          ) : (
            assessments!.results.map((a) => (
              <TouchableOpacity
                key={a.id}
                className="flex-row items-center justify-between border border-slate-200 rounded-lg px-3 py-2 mb-2"
                onPress={() =>
                  router.push({ pathname: '/assessment/results', params: { assessmentId: a.id } })
                }
              >
                <Text className="text-sm text-slate-900 capitalize">
                  {a.eye} eye · {new Date(a.assessed_at).toLocaleDateString('en-GB')}
                </Text>
                <Text className="text-xs text-slate-500 capitalize">{a.status}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/patients/TrendChart.tsx mobile/app/patient/
git commit -m "feat: patient profile with NIBUT trend chart and assessment history"
```

---

## Task 11: Select-test screen

**Files:**
- Create: `mobile/app/assessment/select-test.tsx`

- [ ] **Step 1: Create `mobile/app/assessment/select-test.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateAssessment } from '@/hooks/useAssessments';
import type { Eye, TestType } from '@shared/types/assessment';

const EYES: { value: Eye; label: string }[] = [
  { value: 'right', label: 'Right Eye' },
  { value: 'left', label: 'Left Eye' },
];

const TEST_TYPES: { value: TestType; label: string; description: string }[] = [
  { value: 'nibut', label: 'NIBUT', description: 'Non-invasive tear break-up time via Placido rings' },
  { value: 'fluorescein', label: 'Fluorescein', description: 'Tear break-up under blue light with dye' },
  { value: 'lipid', label: 'Lipid Layer', description: 'Interference pattern lipid thickness grading' },
];

export default function SelectTestScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();
  const createAssessment = useCreateAssessment();

  const [selectedEye, setSelectedEye] = useState<Eye | null>(null);
  const [selectedTest, setSelectedTest] = useState<TestType | null>(null);

  async function handleStart() {
    if (!selectedEye || !selectedTest || !patientId) return;
    try {
      const assessment = await createAssessment.mutateAsync({
        patient: Number(patientId),
        eye: selectedEye,
      });
      router.push({
        pathname: '/assessment/instructions',
        params: { assessmentId: String(assessment.id), testType: selectedTest },
      });
    } catch {
      // error is surfaced via createAssessment.isError
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center pt-4 mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">New Assessment</Text>
        </View>

        {/* Eye selection */}
        <Text className="text-sm font-semibold text-slate-600 uppercase mb-2 tracking-wide">
          Which eye?
        </Text>
        <View className="flex-row gap-3 mb-6">
          {EYES.map((eye) => (
            <TouchableOpacity
              key={eye.value}
              className={`flex-1 rounded-xl py-4 items-center border-2 ${
                selectedEye === eye.value
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-slate-300 bg-white'
              }`}
              onPress={() => setSelectedEye(eye.value)}
              activeOpacity={0.8}
            >
              <Text className={`font-semibold text-base ${
                selectedEye === eye.value ? 'text-teal-700' : 'text-slate-700'
              }`}>
                {eye.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Test type selection */}
        <Text className="text-sm font-semibold text-slate-600 uppercase mb-2 tracking-wide">
          Test type
        </Text>
        {TEST_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            className={`rounded-xl p-4 mb-3 border-2 ${
              selectedTest === t.value
                ? 'border-teal-600 bg-teal-50'
                : 'border-slate-300 bg-white'
            }`}
            onPress={() => setSelectedTest(t.value)}
            activeOpacity={0.8}
          >
            <Text className={`font-semibold text-base mb-0.5 ${
              selectedTest === t.value ? 'text-teal-700' : 'text-slate-900'
            }`}>
              {t.label}
            </Text>
            <Text className="text-sm text-slate-600">{t.description}</Text>
          </TouchableOpacity>
        ))}

        {createAssessment.isError && (
          <Text className="text-status-severe text-sm mt-2">
            Could not create assessment. Please try again.
          </Text>
        )}

        {/* Start button */}
        <TouchableOpacity
          className={`rounded-xl py-4 items-center mt-4 mb-8 ${
            selectedEye && selectedTest ? 'bg-teal-600' : 'bg-slate-300'
          }`}
          onPress={handleStart}
          disabled={!selectedEye || !selectedTest || createAssessment.isPending}
          activeOpacity={0.8}
        >
          {createAssessment.isPending
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Continue</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/assessment/select-test.tsx
git commit -m "feat: assessment select-test screen (eye + test type picker)"
```

---

## Task 12: Instructions screen

**Files:**
- Create: `mobile/app/assessment/instructions.tsx`

- [ ] **Step 1: Create `mobile/app/assessment/instructions.tsx`**

```tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TestType } from '@shared/types/assessment';

const INSTRUCTIONS: Record<TestType, { title: string; steps: string[] }> = {
  nibut: {
    title: 'NIBUT Capture',
    steps: [
      'Ensure the Placido disc attachment is firmly clipped onto the rear camera.',
      'Position the patient with their chin on the rest if available.',
      'Ask the patient to blink twice slowly, then hold their eye wide open.',
      'Hold the phone with the Placido disc 3–5 cm from the eye.',
      'Tap record when the rings are clearly visible on the cornea.',
    ],
  },
  fluorescein: {
    title: 'Fluorescein Capture',
    steps: [
      'Instil one drop of fluorescein into the lower fornix.',
      'Ask the patient to blink twice to spread the dye.',
      'Wait 30 seconds for the dye to equilibrate.',
      'Apply the blue light filter and position the phone.',
      'Tap record when you can see the fluorescein pattern clearly.',
    ],
  },
  lipid: {
    title: 'Lipid Layer Capture',
    steps: [
      'Position the specular reflection light source at the correct angle.',
      'Ask the patient to look straight ahead at a fixed target.',
      'Adjust position until you can see interference colour fringes.',
      'Ensure the patient does not blink during capture.',
      'Tap record when the lipid pattern is stable and in focus.',
    ],
  },
};

export default function InstructionsScreen() {
  const { assessmentId, testType } = useLocalSearchParams<{
    assessmentId: string;
    testType: TestType;
  }>();
  const router = useRouter();
  const instructions = INSTRUCTIONS[testType] ?? INSTRUCTIONS.nibut;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center pt-4 mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">{instructions.title}</Text>
        </View>

        <Text className="text-sm font-semibold text-slate-600 uppercase mb-4 tracking-wide">
          Before you begin
        </Text>

        {instructions.steps.map((step, i) => (
          <View key={i} className="flex-row mb-4">
            <View className="w-7 h-7 rounded-full bg-teal-600 items-center justify-center mr-3 mt-0.5 shrink-0">
              <Text className="text-white text-xs font-bold">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-slate-700 text-base leading-relaxed">{step}</Text>
          </View>
        ))}

        <TouchableOpacity
          className="bg-coral-500 rounded-xl py-4 items-center mt-6 mb-8"
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: '/assessment/capture',
              params: { assessmentId, testType },
            })
          }
        >
          <Text className="text-white font-semibold text-base">I'm ready — start capture</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/assessment/instructions.tsx
git commit -m "feat: pre-capture instructions screen"
```

---

## Task 13: Capture components

**Files:**
- Create: `mobile/components/capture/AlignmentOverlay.tsx`
- Create: `mobile/components/capture/CaptureButton.tsx`
- Create: `mobile/components/capture/StatePrompt.tsx`
- Create: `mobile/components/capture/TimerDisplay.tsx`

- [ ] **Step 1: Create `mobile/components/capture/AlignmentOverlay.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

export type CaptureState = 'READY' | 'ALIGNING' | 'ALIGNED' | 'RECORDING' | 'COMPLETE';

const SIZE = 260;

export function AlignmentOverlay({ state }: { state: CaptureState }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'ALIGNING') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.25, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => { loop.stop(); pulse.setValue(1); };
    }
    pulse.setValue(1);
  }, [state, pulse]);

  const borderColor =
    state === 'ALIGNED' || state === 'RECORDING'
      ? '#4ADE80'
      : state === 'ALIGNING'
      ? '#0E7C7B'
      : 'rgba(203,213,225,0.6)';

  const bgColor =
    state === 'ALIGNED' || state === 'RECORDING'
      ? 'rgba(74,222,128,0.07)'
      : 'transparent';

  return (
    <View
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -(SIZE / 2),
        marginLeft: -(SIZE / 2),
        width: SIZE,
        height: SIZE,
        pointerEvents: 'none',
      }}
    >
      <Animated.View
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 3,
          borderColor,
          backgroundColor: bgColor,
          opacity: pulse,
        }}
      />
    </View>
  );
}
```

- [ ] **Step 2: Create `mobile/components/capture/CaptureButton.tsx`**

```tsx
import { TouchableOpacity, View } from 'react-native';
import type { CaptureState } from './AlignmentOverlay';

interface Props {
  state: CaptureState;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function CaptureButton({ state, onStartRecording, onStopRecording }: Props) {
  const isActive = state === 'ALIGNED' || state === 'RECORDING';
  const bgColor =
    state === 'RECORDING' ? '#EF4444' :
    state === 'ALIGNED' ? '#F97066' :
    '#CBD5E1';

  function handlePress() {
    if (state === 'ALIGNED') onStartRecording();
    else if (state === 'RECORDING') onStopRecording();
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={!isActive}
      activeOpacity={0.8}
    >
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: bgColor,
          borderWidth: 4,
          borderColor: 'rgba(255,255,255,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {state === 'RECORDING' ? (
          // Stop icon (square)
          <View style={{ width: 28, height: 28, borderRadius: 5, backgroundColor: 'white' }} />
        ) : (
          // Shutter circle
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'white', opacity: 0.9 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 3: Create `mobile/components/capture/StatePrompt.tsx`**

```tsx
import { Text } from 'react-native';
import type { CaptureState } from './AlignmentOverlay';
import type { TestType } from '@shared/types/assessment';

const RECORDING_PROMPTS: Record<TestType, string> = {
  nibut: 'Ask patient to blink twice, then hold eye wide open',
  fluorescein: 'Recording fluorescein break-up…',
  lipid: 'Recording lipid layer…',
};

const STATE_PROMPTS: Partial<Record<CaptureState, string>> = {
  READY: 'Position the Placido disc over the patient\'s eye',
  ALIGNING: 'Hold steady… aligning',
  ALIGNED: 'Aligned. Tap to start recording',
  COMPLETE: '',
};

export function StatePrompt({ state, testType }: { state: CaptureState; testType: TestType }) {
  const text =
    state === 'RECORDING'
      ? RECORDING_PROMPTS[testType]
      : STATE_PROMPTS[state] ?? '';

  return (
    <Text
      style={{
        color: state === 'ALIGNED' || state === 'RECORDING' ? '#4ADE80' : 'rgba(255,255,255,0.9)',
        fontSize: 15,
        fontWeight: '500',
        textAlign: 'center',
        paddingHorizontal: 24,
      }}
    >
      {text}
    </Text>
  );
}
```

- [ ] **Step 4: Create `mobile/components/capture/TimerDisplay.tsx`**

```tsx
import { Text } from 'react-native';

export function TimerDisplay({ elapsed, visible }: { elapsed: number; visible: boolean }) {
  if (!visible) return null;
  const s = elapsed % 60;
  const m = Math.floor(elapsed / 60);
  const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '00')}`;
  return (
    <Text style={{ color: 'white', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
      {formatted}
    </Text>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add mobile/components/capture/
git commit -m "feat: capture screen components (overlay, button, prompt, timer)"
```

---

## Task 14: Capture screen

**Files:**
- Create: `mobile/app/assessment/capture.tsx`

- [ ] **Step 1: Create `mobile/app/assessment/capture.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, BackHandler, StyleSheet, SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AlignmentOverlay, type CaptureState } from '@/components/capture/AlignmentOverlay';
import { CaptureButton } from '@/components/capture/CaptureButton';
import { StatePrompt } from '@/components/capture/StatePrompt';
import { TimerDisplay } from '@/components/capture/TimerDisplay';
import type { TestType } from '@shared/types/assessment';

const TEST_LABELS: Record<TestType, string> = {
  nibut: 'NIBUT Test',
  fluorescein: 'Fluorescein Test',
  lipid: 'Lipid Layer Test',
};

export default function CaptureScreen() {
  const { assessmentId, testType } = useLocalSearchParams<{
    assessmentId: string;
    testType: TestType;
  }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [captureState, setCaptureState] = useState<CaptureState>('READY');
  const [elapsed, setElapsed] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  // Simulated Placido ring detection — replace with real CV detection here
  // TODO: replace with actual ring detection (CV pipeline, Sprint 3)
  useEffect(() => {
    const t1 = setTimeout(() => setCaptureState('ALIGNING'), 500);
    const t2 = setTimeout(() => setCaptureState('ALIGNED'), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Recording elapsed timer
  useEffect(() => {
    if (captureState !== 'RECORDING') return;
    setElapsed(0);
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [captureState]);

  // Android hardware back button — stop recording gracefully
  useEffect(() => {
    if (captureState !== 'RECORDING') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cameraRef.current?.stopRecording();
      return true;
    });
    return () => sub.remove();
  }, [captureState]);

  if (!permission) return <View style={styles.fill} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.fill, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>
          Camera access required
        </Text>
        <Text style={{ textAlign: 'center', color: '#475569', marginBottom: 24 }}>
          TearFlex needs camera access to record tear film videos. Please enable it in Settings.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{ backgroundColor: '#0E7C7B', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Grant permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  async function handleStartRecording() {
    setCaptureState('RECORDING');
    try {
      const video = await cameraRef.current?.recordAsync({ maxDuration: 25 });
      if (video?.uri) {
        setCaptureState('COMPLETE');
        router.replace({
          pathname: '/assessment/processing',
          params: { assessmentId, testType, videoUri: video.uri },
        });
      }
    } catch {
      setCaptureState('ALIGNED');
    }
  }

  function handleStopRecording() {
    cameraRef.current?.stopRecording();
    // recordAsync promise will resolve, triggering navigation above
  }

  return (
    <View style={styles.fill}>
      <StatusBar hidden />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        videoQuality="2160p"
      />

      {/* Alignment overlay (centred on camera) */}
      <AlignmentOverlay state={captureState} />

      {/* Top bar */}
      <View style={styles.topBar}>
        {captureState !== 'RECORDING' && (
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.testLabel}>{TEST_LABELS[testType] ?? 'Capture'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TimerDisplay elapsed={elapsed} visible={captureState === 'RECORDING'} />
        <StatePrompt state={captureState} testType={testType} />
        <View style={{ height: 16 }} />
        <CaptureButton
          state={captureState}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />
        <View style={{ height: 32 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'black' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  cancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: 'white', fontSize: 18 },
  testLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/assessment/capture.tsx
git commit -m "feat: full-screen capture screen with state machine and camera recording"
```

---

## Task 15: Processing screen

**Files:**
- Create: `mobile/app/assessment/processing.tsx`

- [ ] **Step 1: Create `mobile/app/assessment/processing.tsx`**

```tsx
import { useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCapture } from '@/hooks/useCapture';
import { api } from '@/lib/api';
import { colours } from '@/constants/colours';
import type { TestType } from '@shared/types/assessment';

interface CaptureStatusResponse {
  id: number;
  status: 'uploaded' | 'processing' | 'analysed' | 'failed';
}

export default function ProcessingScreen() {
  const { assessmentId, testType, videoUri } = useLocalSearchParams<{
    assessmentId: string;
    testType: TestType;
    videoUri: string;
  }>();
  const router = useRouter();
  const { phase, captureId, error, upload, reset } = useCapture();

  // Start upload on mount
  useEffect(() => {
    upload({ assessmentId: Number(assessmentId), testType, videoUri });
  }, []);

  // Poll for analysis status once upload completes
  const { data: statusData } = useQuery({
    queryKey: ['capture-status', captureId],
    queryFn: () => api.get<CaptureStatusResponse>(`assessments/captures/${captureId}/status/`),
    enabled: phase === 'polling' && !!captureId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'analysed' || s === 'failed' ? false : 2000;
    },
  });

  // Navigate to results when analysis completes
  useEffect(() => {
    if (statusData?.status === 'analysed' && captureId) {
      router.replace({ pathname: '/assessment/results', params: { captureId: String(captureId) } });
    }
  }, [statusData?.status, captureId]);

  if (phase === 'error' || statusData?.status === 'failed') {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-6">
        <Text className="text-xl font-bold text-slate-900 mb-2">Analysis failed</Text>
        <Text className="text-sm text-slate-600 text-center mb-6">
          {error ?? 'The analysis pipeline was unable to process this capture. Please repeat the test.'}
        </Text>
        <TouchableOpacity
          className="bg-teal-600 rounded-xl px-8 py-3 mb-3"
          onPress={() => {
            reset();
            router.replace({
              pathname: '/assessment/select-test',
              params: { patientId: '' },
            });
          }}
        >
          <Text className="text-white font-semibold">Repeat test</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const message =
    phase === 'uploading' ? 'Uploading video…' :
    phase === 'polling' ? 'Analysing tear film…' :
    'Please wait…';

  return (
    <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-6">
      <ActivityIndicator size="large" color={colours.teal600} />
      <Text className="text-lg font-semibold text-slate-900 mt-6">{message}</Text>
      <Text className="text-sm text-slate-600 mt-2 text-center">
        {phase === 'uploading'
          ? 'This may take a moment for a 4K video.'
          : 'The Placido ring pattern is being analysed. This usually takes under 10 seconds.'}
      </Text>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/assessment/processing.tsx
git commit -m "feat: processing screen (upload + analysis poller)"
```

---

## Task 16: Results screen

**Files:**
- Create: `mobile/components/results/NIBUTResult.tsx`
- Create: `mobile/components/results/MetricsGrid.tsx`
- Create: `mobile/app/assessment/results.tsx`

- [ ] **Step 1: Create `mobile/components/results/NIBUTResult.tsx`**

```tsx
import { View, Text } from 'react-native';
import { nibutColour, severityLabel, type NibutThresholds } from '@/constants/colours';
import type { TestResult } from '@shared/types/assessment';

export function NIBUTResult({
  result,
  thresholds,
}: {
  result: TestResult;
  thresholds: NibutThresholds;
}) {
  const color = nibutColour(result.nibut_first_breakup_seconds, thresholds);
  const sev = severityLabel(result.dry_eye_severity);

  return (
    <View
      style={{
        backgroundColor: `${color}18`,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        NIBUT — first break-up
      </Text>
      <Text
        style={{ fontSize: 56, fontWeight: '700', color, fontVariant: ['tabular-nums'], marginTop: 4 }}
      >
        {result.nibut_first_breakup_seconds != null
          ? `${result.nibut_first_breakup_seconds.toFixed(1)}s`
          : '—'}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color, marginTop: 2 }}>{sev}</Text>
    </View>
  );
}
```

- [ ] **Step 2: Create `mobile/components/results/MetricsGrid.tsx`**

```tsx
import { View, Text } from 'react-native';
import type { TestResult } from '@shared/types/assessment';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: '45%' }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 15, fontWeight: '500', color: '#0F172A', fontVariant: ['tabular-nums'], marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

export function MetricsGrid({ result }: { result: TestResult }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1' }}>
      <Metric
        label="NIBUT mean"
        value={result.nibut_mean_breakup_seconds != null ? `${result.nibut_mean_breakup_seconds.toFixed(1)}s` : 'Not assessed'}
      />
      <Metric
        label="Fluorescein grade"
        value={result.fluorescein_grade != null ? String(result.fluorescein_grade) : 'Not assessed'}
      />
      <Metric
        label="Lipid grade"
        value={result.lipid_grade != null ? String(result.lipid_grade) : 'Not assessed'}
      />
      <Metric
        label="Tear meniscus"
        value={result.tear_meniscus_height_mm != null ? `${result.tear_meniscus_height_mm}mm` : 'Not assessed'}
      />
      <Metric
        label="Confidence"
        value={result.confidence_score != null ? `${Math.round(result.confidence_score * 100)}%` : 'Not assessed'}
      />
    </View>
  );
}
```

- [ ] **Step 3: Create `mobile/app/assessment/results.tsx`**

```tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/useAuth';
import { NIBUTResult } from '@/components/results/NIBUTResult';
import { MetricsGrid } from '@/components/results/MetricsGrid';
import { LoadingState } from '@/components/common/LoadingState';
import type { TestCapture } from '@shared/types/assessment';

export default function ResultsScreen() {
  const { captureId } = useLocalSearchParams<{ captureId: string }>();
  const router = useRouter();
  const { data: me } = useMe();

  const { data: capture, isLoading } = useQuery({
    queryKey: ['capture', captureId],
    queryFn: () => api.get<TestCapture>(`assessments/captures/${captureId}/`),
    enabled: !!captureId,
  });

  const thresholds = {
    normal: me?.clinician.practice.nibut_normal_threshold ?? 10,
    borderline: me?.clinician.practice.nibut_borderline_threshold ?? 5,
  };

  if (isLoading || !capture) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 px-4 pt-4">
        <LoadingState rows={4} />
      </SafeAreaView>
    );
  }

  const result = capture.result;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="pt-6 pb-2">
          <Text className="text-2xl font-bold text-slate-900">Results</Text>
          <Text className="text-sm text-slate-600 mt-0.5 capitalize">
            {capture.test_type} · {new Date(capture.captured_at).toLocaleString('en-GB')}
          </Text>
        </View>

        {result ? (
          <>
            <NIBUTResult result={result} thresholds={thresholds} />
            <MetricsGrid result={result} />
            {/* Heatmap placeholder — pipeline will generate one in Sprint 3 */}
            <View className="bg-white border border-slate-300 rounded-2xl p-4 mt-4">
              <Text className="font-semibold text-slate-900 mb-2">Tear film heatmap</Text>
              <View className="h-32 bg-slate-100 rounded-xl items-center justify-center">
                <Text className="text-sm text-slate-500 text-center px-4">
                  Heatmap will appear here once the analysis pipeline generates one.
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View className="bg-white border border-slate-300 rounded-2xl p-6 items-center">
            <Text className="text-slate-600 text-center">No results available yet.</Text>
          </View>
        )}

        {/* Action buttons */}
        <View className="flex-row gap-3 mt-6 mb-10">
          <TouchableOpacity
            className="flex-1 border-2 border-teal-600 rounded-xl py-3 items-center"
            onPress={() => {
              // Pop back to patient profile (go back 4 screens: results → processing → capture → instructions → select-test, or go direct)
              router.dismissAll();
            }}
            activeOpacity={0.8}
          >
            <Text className="text-teal-700 font-semibold">Done</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-1 bg-teal-600 rounded-xl py-3 items-center"
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text className="text-white font-semibold">Repeat test</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/results/ mobile/app/assessment/results.tsx
git commit -m "feat: results screen with NIBUT headline, metrics grid, and action buttons"
```

---

## Task 17: Development build + end-to-end verification

- [ ] **Step 1: Final typecheck — confirm zero errors**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 2: Build the iOS development build**

```bash
npx expo run:ios
```

Expected: builds and launches in iOS Simulator. The root layout reads SecureStore (empty on first run) and redirects to the login screen.

- [ ] **Step 3: Build the Android development build**

```bash
npx expo run:android
```

Expected: builds and launches in Android Emulator or device. Redirects to login.

- [ ] **Step 4: Manual smoke test — Auth**

On both platforms:
1. Open the app — confirm redirect to login screen.
2. Enter invalid credentials — confirm "Invalid username or password." error appears.
3. Enter valid credentials (`admin` user from Django) — confirm redirect to Patients tab.
4. Force-quit and reopen — confirm the session persists (tokens in SecureStore) and redirects to Patients, not login.
5. Tap Settings → confirm practice name and clinician name appear.

- [ ] **Step 5: Manual smoke test — Patient list**

1. Confirm patient list loads with severity badges.
2. Type a name in the search box — confirm results filter after ~300 ms debounce.
3. Tap a patient — confirm profile screen with NIBUT trend chart (flat if no data) and "New assessment" button.

- [ ] **Step 6: Manual smoke test — Capture flow (NIBUT)**

1. Tap "New assessment" on a patient.
2. Select Right eye → NIBUT → Continue.
3. Read instructions → "I'm ready" → enter capture screen.
4. Confirm the circular overlay appears and auto-advances through READY → ALIGNING (teal pulse) → ALIGNED (green, button activates) in ~2 seconds.
5. Tap the coral button — confirm RECORDING state, timer counts up, prompt text changes.
6. Tap the stop (square) button — confirm navigation to processing screen.
7. Confirm "Uploading video…" then "Analysing tear film…" text.
8. Confirm navigation to results screen showing NIBUT value (7.2 s from the stub pipeline), "Mild" severity badge, and metrics grid.
9. Tap Done — confirm navigation back to patient profile.

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "chore: mobile sprint 2 complete — auth, patient list, capture flow, results"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Expo SDK 52 + expo-dev-client, iOS + Android | Task 2 |
| JWT auth with SecureStore, auto-refresh | Tasks 3–4 |
| Auth guard + login screen | Task 6 |
| Patient list with search (debounced) | Task 9 |
| Patient profile with NIBUT trend chart | Task 10 |
| Assessment creation (eye + test type) | Task 11 |
| Pre-capture instructions | Task 12 |
| AlignmentOverlay, CaptureButton, StatePrompt, TimerDisplay | Task 13 |
| Full-screen capture screen with state machine | Task 14 |
| Simulated 2 s alignment auto-advance | Task 14 |
| RECORDING state machine + 25 s max | Task 14 |
| Android back button stops recording gracefully | Task 14 |
| Simple multipart video upload | Task 15 |
| Analysis poller (2 s interval, stops on analysed/failed) | Task 15 |
| Results: NIBUT headline, metrics grid, heatmap placeholder | Task 16 |
| Done + Repeat buttons | Task 16 |
| Backend CaptureUploadView practice scoping + permission_classes | Task 1 |
| Practice thresholds applied to NIBUT colour-coding | Tasks 10, 16 |

**Known limitations (acceptable for this sprint):**
- `postMultipart` does not retry on 401 (session should not expire mid-upload).
- `Repeat` button on results screen navigates back one step — if the assessment context is lost (app restart), the user would need to start from the patient profile. Acceptable for Sprint 2.
- Victory Native / charting library: uses `react-native-svg` directly to avoid React Native new arch compatibility issues with older charting libs.
