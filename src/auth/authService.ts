import type { LoginCredentials, AuthResponse, User } from './types';

const MCP_BASE =
  (import.meta as any).env?.VITE_MCP_BASE_URL
  || 'http://localhost:5000';

const BACKEND_BASE =
  (import.meta as any).env?.VITE_BACKEND_BASE_URL
  || (import.meta as any).env?.VITE_API_BASE_URL
  || 'http://localhost:8000';

interface MCPLoginResponse {
  access_token?: string;
  refresh_token?: string;
  token: string;
  refreshToken?: string;
  user: User;
}

function readAuthTokens(payload: {
  token?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
}): { token: string; refreshToken?: string } {
  const token = payload.access_token || payload.token;
  if (!token) {
    throw new Error('Authentication response missing access token');
  }
  return {
    token,
    refreshToken: payload.refresh_token || payload.refreshToken,
  };
}

let refreshInFlight: Promise<string | null> | null = null;

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const apiRes = await fetch(`${BACKEND_BASE}/auth/snowflake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: credentials.account,
        username: credentials.username,
        password: credentials.password,
        role: credentials.role,
      }),
    });
    if (!apiRes.ok) {
      const body = await apiRes.json().catch(() => ({}));
      throw new Error(body?.detail?.detail || body?.detail || body?.message || 'Snowflake authentication failed');
    }
    const apiData = await apiRes.json() as {
      access_token: string;
      refresh_token?: string;
      role: string;
      primary_role?: string;
      roles?: string[];
      user_id: string;
      display_name: string;
      allowed_models?: string[];
      allowed_skills?: string[];
      enabled_features?: string[];
    };

    const apiUser: User = {
      id: apiData.user_id,
      email: `${credentials.username}@${credentials.account}.snowflakecomputing.com`,
      name: apiData.display_name || credentials.username,
      role: apiData.role,
      roles: apiData.roles || [],
      primaryRole: apiData.primary_role || apiData.role,
      allowedModels: apiData.allowed_models || [],
      allowedSkills: apiData.allowed_skills || [],
      enabledFeatures: apiData.enabled_features || [],
      createdAt: new Date().toISOString(),
    };

    // Secondary (best-effort): authenticate via MCP for SQL workspace tools.
    try {
      const mcpRes = await fetch(`${MCP_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: credentials.account,
          username: credentials.username,
          password: credentials.password,
          role: credentials.role,
        }),
      });
      if (mcpRes.ok) {
        const mcpData = await mcpRes.json() as MCPLoginResponse;
        const mcpToken = mcpData.access_token || mcpData.token;
        if (mcpToken) {
          localStorage.setItem('mcp_token', mcpToken);
          if (mcpData.refresh_token || mcpData.refreshToken) {
            localStorage.setItem('mcp_refresh_token', (mcpData.refresh_token || mcpData.refreshToken)!);
          }
        }
      }
    } catch {
      // MCP unavailable — SQL workspace features will show connection error
    }

    return {
      token: apiData.access_token,
      refreshToken: apiData.refresh_token,
      user: apiUser,
    };
  },

  async refreshSession(): Promise<string | null> {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      return null;
    }

    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BACKEND_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) {
          return null;
        }

        const data = await res.json() as { access_token: string; refresh_token?: string };
        localStorage.setItem('auth_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token);
        }
        return data.access_token;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  },

  async me(): Promise<User> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('No token');

    const backendRes = await fetch(`${BACKEND_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!backendRes.ok) throw new Error('Session expired');
    const data = await backendRes.json() as {
      user_id: string;
      email: string;
      role: string;
      primary_role: string;
      roles: string[];
      display_name?: string;
      allowed_models: string[];
      allowed_skills: string[];
      enabled_features: string[];
    };
    return {
      id: data.user_id,
      email: data.email,
      name: data.display_name || data.email,
      role: data.role,
      roles: data.roles || [],
      primaryRole: data.primary_role || data.role,
      allowedModels: data.allowed_models || [],
      allowedSkills: data.allowed_skills || [],
      enabledFeatures: data.enabled_features || [],
      createdAt: new Date().toISOString(),
    };
  },

  logout(): void {
    const explorerCachePrefix = 'mcp-explorer-cache-v1:';
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(explorerCachePrefix)) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('mcp_token');
    localStorage.removeItem('mcp_refresh_token');
    localStorage.removeItem('sf_account');
    localStorage.removeItem('sf_username');
    localStorage.removeItem('sf_role');
  },
};
