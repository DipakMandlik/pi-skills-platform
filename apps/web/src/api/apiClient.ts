const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function getHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(token), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface SkillRecord {
  skill_id: string;
  display_name: string;
  description: string;
  skill_type: string;
  domain: string;
  required_models: string[];
  is_enabled: boolean;
  version: string;
  input_schema: Record<string, unknown>;
  output_format: Record<string, unknown>;
  execution_handler: string;
  error_handling: Record<string, unknown>;
  instructions: string;
  assignment_count: number;
}

export interface SkillsListResult {
  skills: SkillRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserRecord {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
}

export interface UsersListResult {
  users: UserRecord[];
  total: number;
  page: number;
  page_size: number;
}

export const skillsApi = {
  list: (token: string | null, params?: { page?: number; page_size?: number; search?: string; skill_type?: string; domain?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.search) qs.set('search', params.search);
    if (params?.skill_type) qs.set('skill_type', params.skill_type);
    if (params?.domain) qs.set('domain', params.domain);
    const q = qs.toString();
    return request<SkillsListResult>(`/skills${q ? `?${q}` : ''}`, token);
  },

  get: (token: string | null, skillId: string) =>
    request<SkillRecord>(`/skills/${skillId}`, token),

  create: (token: string | null, data: {
    skill_id: string;
    display_name: string;
    description: string;
    skill_type: string;
    domain: string;
    required_models?: string[];
    input_schema?: Record<string, unknown>;
    output_format?: Record<string, unknown>;
    execution_handler?: string;
    error_handling?: Record<string, unknown>;
    instructions?: string;
    is_enabled?: boolean;
  }) => request<SkillRecord>('/skills', token, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  update: (token: string | null, skillId: string, data: Record<string, unknown>) =>
    request<SkillRecord>(`/skills/${skillId}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (token: string | null, skillId: string) =>
    request<{ deleted: boolean; skill_id: string; message: string }>(`/skills/${skillId}`, token, {
      method: 'DELETE',
    }),

  toggle: (token: string | null, skillId: string, is_enabled: boolean) =>
    request<{ skill_id: string; is_enabled: boolean; updated_at: string }>(`/skills/${skillId}/state`, token, {
      method: 'PATCH',
      body: JSON.stringify({ is_enabled }),
    }),

  assign: (token: string | null, userId: string, skillId: string, expiresAt?: string) =>
    request<Record<string, string>>('/skills/assign', token, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, skill_id: skillId, expires_at: expiresAt }),
    }),

  revoke: (token: string | null, userId: string, skillId: string) =>
    request<Record<string, string>>('/skills/revoke', token, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, skill_id: skillId }),
    }),
};

export const usersApi = {
  list: (token: string | null, page = 1, pageSize = 50) =>
    request<UsersListResult>(`/users?page=${page}&page_size=${pageSize}`, token),
};

export interface ModelRecord {
  model_id: string;
  display_name: string;
  provider: string;
  tier: string;
  is_available: boolean;
  access?: {
    granted_at: string;
    expires_at: string | null;
    is_active: boolean;
  };
}

export interface ModelsListResult {
  models: ModelRecord[];
}

export const modelsApi = {
  list: (token: string | null) =>
    request<ModelsListResult>('/models', token),

  assign: (token: string | null, userId: string, modelId: string, expiresAt?: string) =>
    request<{ permission_id: string; user_id: string; model_id: string; granted_at: string; expires_at: string | null; granted_by: string }>('/models/assign', token, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, model_id: modelId, expires_at: expiresAt }),
    }),

  revoke: (token: string | null, userId: string, modelId: string) =>
    request<{ revoked: boolean; effective_immediately: boolean; cache_invalidated: boolean }>('/models/revoke', token, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, model_id: modelId }),
    }),
};
