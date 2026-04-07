const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; total: number; per_page: number; total_pages: number };
  error?: { code: string; message: string; details?: string[] };
}

interface ApiError {
  code: string;
  message: string;
  details?: string[];
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options?.headers || {}) },
    });

    const json: ApiResponse<T> = await res.json();

    if (!res.ok || !json.success) {
      const err: ApiError = json.error || { code: 'UNKNOWN', message: `HTTP ${res.status}` };
      const error = new Error(err.message) as Error & { code: string; details?: string[] };
      error.code = err.code;
      error.details = err.details;
      throw error;
    }

    return json.data;
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);

export interface Skill {
  id: string;
  org_id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  status: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  last_active: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Team {
  id: string;
  org_id: string;
  name: string;
  description: string;
  member_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface OrgStats {
  total_users: number;
  total_teams: number;
  total_skills: number;
  total_assignments: number;
  active_users: number;
}

export const skillsApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; category?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    return api.get<{ items: Skill[]; meta: { page: number; total: number; per_page: number; total_pages: number } }>(`/api/skills${q ? `?${q}` : ''}`);
  },
  get: (id: string) => api.get<Skill>(`/api/skills/${id}`),
  create: (data: { name: string; description?: string; content?: string; category?: string }) => api.post<Skill>('/api/skills', data),
  update: (id: string, data: Partial<{ name: string; description: string; content: string; category: string }>) => api.put<Skill>(`/api/skills/${id}`, data),
  patch: (id: string, data: Partial<{ name: string; description: string; content: string; category: string }>) => api.patch<Skill>(`/api/skills/${id}`, data),
  delete: (id: string) => api.delete<{ deleted: boolean; skill_id: string }>(`/api/skills/${id}`),
  versions: (id: string) => api.get<{ id: string; skill_id: string; content: string; version: number; created_by: string; created_at: string }[]>(`/api/skills/${id}/versions`),
  publish: (id: string) => api.post<{ id: string; status: string; version: number }>(`/api/skills/${id}/publish`, {}),
  duplicate: (id: string) => api.post<Skill>(`/api/skills/${id}/duplicate`, {}),
  assignments: (id: string) => api.get<{ id: string; skill_id: string; assignee_type: string; assignee_id: string; assigned_by: string; assigned_at: string; expires_at: string | null }[]>(`/api/skills/${id}/assignments`),
  test: (id: string, input_data: Record<string, unknown>) => api.post<{ id: string; skill_id: string; user_id: string; status: string; output_data: Record<string, unknown> | null; duration_ms: number | null; created_at: string }>(`/api/skills/${id}/test`, { input_data }),
};

export const usersApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; role?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.search) qs.set('search', params.search);
    if (params?.role) qs.set('role', params.role);
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    return api.get<{ items: User[]; meta: { page: number; total: number; per_page: number; total_pages: number } }>(`/api/users${q ? `?${q}` : ''}`);
  },
  get: (id: string) => api.get<User>(`/api/users/${id}`),
  update: (id: string, data: Partial<{ name: string; role: string; status: string }>) => api.patch<User>(`/api/users/${id}`, data),
  delete: (id: string) => api.delete<{ deleted: boolean; user_id: string }>(`/api/users/${id}`),
  skills: (id: string) => api.get<{ id: string; name: string; category: string; status: string; assigned_at: string }[]>(`/api/users/${id}/skills`),
  assignSkills: (id: string, skill_ids: string[]) => api.post<{ skill_id: string; assigned_at: string }[]>(`/api/users/${id}/skills`, { skill_ids }),
  removeSkill: (userId: string, skillId: string) => api.delete<{ removed: boolean; user_id: string; skill_id: string }>(`/api/users/${userId}/skills/${skillId}`),
  invite: (email: string, role: string) => api.post<{ email: string; role: string; token: string; expires_at: string }>('/api/users/invite', { email, role }),
};

export const teamsApi = {
  list: (params?: { page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    const q = qs.toString();
    return api.get<{ items: Team[]; meta: { page: number; total: number; per_page: number; total_pages: number } }>(`/api/teams${q ? `?${q}` : ''}`);
  },
  create: (data: { name: string; description?: string }) => api.post<Team>('/api/teams', data),
  get: (id: string) => api.get<Team>(`/api/teams/${id}`),
  update: (id: string, data: Partial<{ name: string; description: string }>) => api.patch<Team>(`/api/teams/${id}`, data),
  delete: (id: string) => api.delete<{ deleted: boolean; team_id: string }>(`/api/teams/${id}`),
  addMembers: (id: string, user_ids: string[]) => api.post<{ id: string; user_id: string; team_id: string; joined_at: string }[]>(`/api/teams/${id}/members`, { user_ids }),
  removeMember: (teamId: string, userId: string) => api.delete<{ removed: boolean; team_id: string; user_id: string }>(`/api/teams/${teamId}/members/${userId}`),
  skills: (id: string) => api.get<{ id: string; name: string; category: string; status: string }[]>(`/api/teams/${id}/skills`),
  assignSkills: (id: string, skill_ids: string[]) => api.post<{ skill_id: string; assigned_at: string }[]>(`/api/teams/${id}/skills`, { skill_ids }),
};

export const orgApi = {
  get: () => api.get<{ id: string; name: string; slug: string; plan: string; created_at: string }>(`/api/org`),
  update: (data: Partial<{ name: string; plan: string }>) => api.patch<{ id: string; name: string; slug: string; plan: string; created_at: string }>('/api/org', data),
  stats: () => api.get<OrgStats>('/api/org/stats'),
  activity: (params?: { page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    const q = qs.toString();
    return api.get<{ items: { id: string; user_id: string; action: string; resource_type: string; resource_id: string | null; created_at: string }[]; meta: { page: number; total: number; per_page: number; total_pages: number } }>(`/api/org/activity${q ? `?${q}` : ''}`);
  },
};

export const assignmentsApi = {
  create: (data: { skill_id: string; assignee_type: string; assignee_id: string; expires_at?: string }) =>
    api.post<{ id: string; skill_id: string; assignee_type: string; assignee_id: string; assigned_by: string; assigned_at: string; expires_at: string | null }>('/api/assignments', data),
  delete: (data: { skill_id: string; assignee_type: string; assignee_id: string }) =>
    api.delete<{ deleted: boolean; count: number }>('/api/assignments'),
  list: (params?: { page?: number; page_size?: number; skill_id?: string; assignee_type?: string; assignee_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.skill_id) qs.set('skill_id', params.skill_id);
    if (params?.assignee_type) qs.set('assignee_type', params.assignee_type);
    if (params?.assignee_id) qs.set('assignee_id', params.assignee_id);
    const q = qs.toString();
    return api.get<{ items: { id: string; skill_id: string; assignee_type: string; assignee_id: string; assigned_by: string; assigned_at: string; expires_at: string | null }[]; meta: { page: number; total: number; per_page: number; total_pages: number } }>(`/api/assignments${q ? `?${q}` : ''}`);
  },
};

export const analyticsApi = {
  skillUsage: (params?: { days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set('days', String(params.days));
    const q = qs.toString();
    return api.get<{ skill_id: string; skill_name: string; execution_count: number }[]>(`/api/analytics/skills/usage${q ? `?${q}` : ''}`);
  },
  skillErrors: (params?: { days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set('days', String(params.days));
    const q = qs.toString();
    return api.get<{ skill_id: string; skill_name: string; error_count: number; error_rate: number }[]>(`/api/analytics/skills/errors${q ? `?${q}` : ''}`);
  },
  userActivity: () => api.get<{ active_users: number; total_executions: number; avg_duration_ms: number }>('/api/analytics/users/activity'),
  trends: (params?: { days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set('days', String(params.days));
    const q = qs.toString();
    return api.get<{ date: string; executions: number; unique_users: number }[]>(`/api/analytics/trends${q ? `?${q}` : ''}`);
  },
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; refresh_token: string; token_type: string; expires_in: number; user: { user_id: string; org_id: string; email: string; name: string; role: string; status: string } }>('/api/auth/login', { email, password }),
  refresh: (refresh_token: string) =>
    api.post<{ access_token: string; refresh_token: string; expires_in: number }>('/api/auth/refresh', { refresh_token }),
  logout: (refresh_token: string) =>
    api.post<{ logged_out: boolean }>('/api/auth/logout', { refresh_token }),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/api/auth/reset-password', { token, password }),
  me: () =>
    api.get<{ user_id: string; org_id: string; email: string; name: string; role: string; roles: string[]; status: string; last_active: string | null; created_at: string }>('/api/auth/me'),
};
