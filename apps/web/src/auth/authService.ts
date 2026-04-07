import type { LoginCredentials, AuthResponse, Role, User } from './types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

type RequestOptions = { timeoutMs?: number };

function toRequestError(err: unknown, fallbackMessage: string): Error {
  if (err instanceof Error) return err;
  return new Error(fallbackMessage);
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error('Backend is not reachable (network error)');
    }
    throw toRequestError(err, 'Request failed');
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRoleFromSnowflake(roles: string[], primaryRole?: string): Role {
  const upper = new Set((roles || []).map(r => String(r || '').toUpperCase()));
  const primary = String(primaryRole || '').toUpperCase();

  // Prefer explicit primary role when present.
  if (primary) upper.add(primary);

  if (upper.has('ACCOUNTADMIN') || upper.has('SYSADMIN') || upper.has('ORG_ADMIN') || upper.has('ORGADMIN')) {
    return 'ORG_ADMIN';
  }
  if (upper.has('SECURITYADMIN') || upper.has('SECURITY_ADMIN')) {
    return 'SECURITY_ADMIN';
  }
  if (upper.has('DATA_ENGINEER')) return 'DATA_ENGINEER';
  if (upper.has('ANALYTICS_ENGINEER')) return 'ANALYTICS_ENGINEER';
  if (upper.has('DATA_SCIENTIST')) return 'DATA_SCIENTIST';
  if (upper.has('BUSINESS_USER') || upper.has('USER')) return 'BUSINESS_USER';
  return 'VIEWER';
}

function readAuthToken(payload: { access_token?: string; token?: string }): string {
  const token = payload.access_token || payload.token;
  if (!token) {
    throw new Error('Authentication response missing access token');
  }
  return token;
}

export const authService = {
  async login(credentials: LoginCredentials, options?: RequestOptions): Promise<AuthResponse> {
    const account = credentials.account || '';
    const username = credentials.username || credentials.email || '';
    const role = credentials.role || 'ACCOUNTADMIN';

    const res = await fetchWithTimeout(
      `${API_BASE}/auth/snowflake`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account,
          username,
          password: credentials.password,
          role,
        }),
      },
      options?.timeoutMs ?? 20000,
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail || body?.message || 'Invalid credentials');
    }
    const data = await res.json() as any;
    const token = readAuthToken(data);
    const roles = Array.isArray(data.roles) ? data.roles : [];
    const primaryRole = data.primary_role || data.primaryRole || data.role || role;
    return {
      token,
      refreshToken: data.refresh_token || data.refreshToken || '',
      user: {
        id: data.user_id,
        email: `${username}@${account}.snowflakecomputing.com`.toLowerCase(),
        name: data.display_name,
        role: normalizeRoleFromSnowflake(roles, primaryRole),
        roles,
        primaryRole,
        createdAt: '',
      },
    };
  },

  async me(options?: RequestOptions): Promise<User> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('No token');
    const res = await fetchWithTimeout(
      `${API_BASE}/auth/me`,
      { headers: { Authorization: `Bearer ${token}` } },
      options?.timeoutMs ?? 3000,
    );
    if (!res.ok) throw new Error('Session expired');
    const data = await res.json() as any;
    const roles = Array.isArray(data.roles) ? data.roles : [];
    const primaryRole = data.primary_role || data.primaryRole || data.role || '';
    return {
      id: data.user_id,
      email: data.email,
      name: data.display_name,
      role: normalizeRoleFromSnowflake(roles, primaryRole),
      roles,
      primaryRole,
      createdAt: '',
    };
  },

  async refresh(options?: RequestOptions): Promise<AuthResponse> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('Cannot refresh - no refresh token stored');
    }

    const res = await fetchWithTimeout(
      `${API_BASE}/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      },
      options?.timeoutMs ?? 10000,
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail || body?.message || 'Refresh failed');
    }

    const data = await res.json() as any;
    const token = readAuthToken(data);
    const nextRefreshToken = data.refresh_token || data.refreshToken || refreshToken;

    return {
      token,
      refreshToken: nextRefreshToken,
      user: {
        id: data.user_id,
        email: data.email,
        name: data.display_name,
        role: normalizeRoleFromSnowflake(Array.isArray(data.roles) ? data.roles : [], data.primary_role || data.role),
        roles: Array.isArray(data.roles) ? data.roles : [],
        primaryRole: data.primary_role || data.role || '',
        createdAt: '',
      },
    };
  },

  async logout(): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        await fetchWithTimeout(
          `${API_BASE}/auth/logout`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
          5000,
        );
      } catch {
        // best-effort — clear local state regardless of network failure
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
  },
};
