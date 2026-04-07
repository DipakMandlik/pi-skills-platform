import { ROUTES } from '../constants/routes';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const REQUEST_TIMEOUT_MS = 20000;

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function readAuthToken(payload: { access_token?: string; token?: string }): string | null {
  return payload.access_token || payload.token || null;
}

function readRefreshToken(payload: { refresh_token?: string; refreshToken?: string }): string | null {
  return payload.refresh_token || payload.refreshToken || null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshTokenIfNeeded(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    const token = readAuthToken(data);
    if (!token) return false;
    localStorage.setItem('auth_token', token);
    const nextRefreshToken = readRefreshToken(data);
    if (nextRefreshToken) {
      localStorage.setItem('refresh_token', nextRefreshToken);
    }
    return true;
  } catch {
    return false;
  }
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const makeRequest = async (tokenOverride?: string): Promise<Response> => {
    const token = tokenOverride ?? localStorage.getItem('auth_token');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError('Request timed out. Please retry.', 0);
      }
      throw new ApiError('Network error. Please retry.', 0);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let attempt = 0;
  let delayMs = 250;
  while (true) {
    let res: Response;
    try {
      res = await makeRequest();
    } catch (error) {
      if (error instanceof ApiError && attempt < 2 && isRetryableStatus(error.status)) {
        attempt += 1;
        await sleep(delayMs + Math.floor(Math.random() * 120));
        delayMs *= 2;
        continue;
      }
      throw error;
    }

    if (res.status === 401) {
      const refreshed = await refreshTokenIfNeeded();
      if (refreshed) {
        const newToken = localStorage.getItem('auth_token');
        res = await makeRequest(newToken || undefined);
      } else {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        window.location.href = ROUTES.LOGIN;
        throw new ApiError('Session expired', 401);
      }
    }

    if (res.ok) {
      return res.json();
    }

    const body = await res.json().catch(() => ({}));
    const message = body?.message || body?.detail || `Request failed: ${res.status}`;

    if (attempt < 2 && isRetryableStatus(res.status)) {
      attempt += 1;
      await sleep(delayMs + Math.floor(Math.random() * 120));
      delayMs *= 2;
      continue;
    }

    throw new ApiError(String(message), res.status, body);
  }
}

export { ApiError };
