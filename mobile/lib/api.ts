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
  constructor(message = 'Session expired') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

async function makeRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const { access, refresh } = await getTokens();

  const res = await fetch(`${API_BASE}/${path.replace(/^\//, '')}`, {
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
    fileField: string = 'video_file',
  ): Promise<T> => {
    const { access } = await getTokens();
    const formData = new FormData();
    Object.entries(fields).forEach(([key, val]) => formData.append(key, val));
    // React Native FormData accepts { uri, name, type } objects directly
    formData.append(fileField, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);

    const res = await fetch(`${API_BASE}/${path.replace(/^\//, '')}`, {
      method: 'POST',
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      body: formData,
      // Do NOT set Content-Type — fetch sets it automatically with the boundary
    });

    if (res.status === 401) {
      await clearTokens();
      throw new AuthExpiredError('Session expired');
    }
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new ApiError(res.status, body.detail ?? 'Login failed');
  }
  const { access, refresh } = await res.json() as { access: string; refresh: string };
  await setTokens(access, refresh);
}
