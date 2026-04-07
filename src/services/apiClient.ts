import { authService } from '../auth/authService';
import { normalizeErrorMessage } from './errorUtils';
import { isDemoMode } from '../demo/demoMode';
import { mockGovernanceRequest } from '../demo/mockGovernanceApi';

const API_BASE = import.meta.env.VITE_BACKEND_BASE_URL
  || import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

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

const REQUEST_TIMEOUT_MS = 20000;

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (isDemoMode()) {
    return mockGovernanceRequest<T>(path, options);
  }

  const makeRequest = async (tokenOverride?: string): Promise<Response> => {
    const token = tokenOverride ?? localStorage.getItem('auth_token') ?? null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    try {
      return await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
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
      const refreshed = await authService.refreshSession();
      if (refreshed) {
        res = await makeRequest(refreshed);
      }
    }

    if (res.ok) {
      return res.json();
    }

    const body = await res.json().catch(() => ({}));
    const baseMessage = body?.message || body?.detail || `Request failed: ${res.status}`;
    const message = normalizeErrorMessage(res.status, String(baseMessage));

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
