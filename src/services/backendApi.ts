import { authService } from '../auth/authService';
import { normalizeErrorMessage } from './errorUtils';
import { isDemoMode } from '../demo/demoMode';
import { mockBackendRequest } from '../demo/mockBackendApi';

const BACKEND = (import.meta as any).env?.VITE_BACKEND_BASE_URL
  || (import.meta as any).env?.VITE_API_BASE_URL
  || ((import.meta as any).env?.DEV ? 'http://localhost:8000' : '/api');

// ── Token Management ──────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

// ── Request with Retry + Cache ────────────────────────────────────

const _cache = new Map<string, { data: unknown; expires: number }>();
const _inflight = new Map<string, Promise<unknown>>();

const REQUEST_TIMEOUT_MS = 20000;

function getCacheKey(path: string, options: RequestInit): string {
  return `${options.method || 'GET'}:${path}`;
}

async function requestWithRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 500,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && !err.retryable) {
      throw err;
    }
    if (retries <= 0) throw err;
    const jitter = Math.floor(Math.random() * 120);
    await new Promise((r) => setTimeout(r, delay + jitter));
    return requestWithRetry(fn, retries - 1, delay * 2);
  }
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (detail && typeof detail === 'object') {
      const nestedDetail = (detail as { detail?: unknown }).detail;
      if (typeof nestedDetail === 'string' && nestedDetail.trim()) {
        return nestedDetail;
      }
      const title = (detail as { title?: unknown }).title;
      if (typeof title === 'string' && title.trim()) {
        return title;
      }
    }
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      return error;
    }
  }
  return `Request failed: ${status}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (isDemoMode()) {
    return mockBackendRequest<T>(path, options);
  }

  const cacheKey = getCacheKey(path, options);
  const method = (options.method || 'GET').toUpperCase();

  // Cache for GET requests (60s TTL)
  if (method === 'GET') {
    const cached = _cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    // Deduplicate in-flight requests
    const inflight = _inflight.get(cacheKey);
    if (inflight) return inflight as Promise<T>;
  }

  const doRequest = async (): Promise<T> => {
    let token = getToken();
    let attemptedRefresh = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const send = async () => {
      try {
        return await fetch(`${BACKEND}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
          },
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new ApiError('Request timed out. Please retry.', 0, true);
        }
        throw new ApiError('Network error. Please check connection and retry.', 0, true);
      }
    };

    try {
      let res = await send();

      if (res.status === 401 && !attemptedRefresh) {
        attemptedRefresh = true;
        const refreshed = await authService.refreshSession();
        if (refreshed) {
          token = refreshed;
          res = await send();
        }
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = extractErrorMessage(body, res.status);
        const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
        throw new ApiError(normalizeErrorMessage(res.status, msg), res.status, retryable);
      }
      return body as T;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const promise = requestWithRetry(doRequest);

  if (method === 'GET') {
    _inflight.set(cacheKey, promise);
    try {
      const result = await promise;
      _cache.set(cacheKey, { data: result, expires: Date.now() + 60000 });
      return result;
    } finally {
      _inflight.delete(cacheKey);
    }
  }

  return promise;
}

export function clearCache(prefix?: string) {
  if (prefix) {
    const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
    for (const key of _cache.keys()) {
      if (key.includes(`:${normalizedPrefix}`)) {
        _cache.delete(key);
      }
    }
  } else {
    _cache.clear();
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryable = false) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Skills ─────────────────────────────────────────────────────────

export interface SkillItem {
  skill_id: string;
  display_name: string;
  description: string;
  required_models: string[];
  is_active: boolean;
  version?: string;
  assignment: { assigned_at: string; expires_at: string | null; is_active: boolean } | null;
}

export interface SkillRegistryItem {
  skill_id: string;
  display_name: string;
  description: string;
  required_models: string[];
  is_enabled: boolean;
  version: string;
  domain?: string;
  skill_type?: string;
  instructions?: string;
  assignment_count?: number;
  input_schema: Record<string, unknown>;
  output_format: Record<string, unknown>;
  execution_handler: string;
  error_handling: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export async function fetchSkills(): Promise<SkillItem[]> {
  const data = await request<{ skills: SkillItem[] }>('/skills');
  return data.skills;
}

export async function assignSkill(userId: string, skillId: string, expiresAt?: string) {
  clearCache('/skills');
  return request('/skills/assign', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, skill_id: skillId, expires_at: expiresAt || null }),
  });
}

export async function revokeSkill(userId: string, skillId: string) {
  clearCache('/skills');
  return request('/skills/revoke', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, skill_id: skillId }),
  });
}

export interface SkillAccessConfig {
  skill_id: string;
  user_ids: string[];
  team_ids: string[];
}

export async function fetchSkillAccess(skillId: string): Promise<SkillAccessConfig> {
  return request<SkillAccessConfig>(`/skills/${skillId}/access`);
}

export async function addSkillAccess(skillId: string, payload: {
  user_ids?: string[];
  team_ids?: string[];
}): Promise<SkillAccessConfig> {
  clearCache('/skills');
  return request<SkillAccessConfig>(`/skills/${skillId}/access/add`, {
    method: 'POST',
    body: JSON.stringify({
      user_ids: payload.user_ids || [],
      team_ids: payload.team_ids || [],
    }),
  });
}

export async function removeSkillAccess(skillId: string, payload: {
  user_ids?: string[];
  team_ids?: string[];
}): Promise<SkillAccessConfig> {
  clearCache('/skills');
  return request<SkillAccessConfig>(`/skills/${skillId}/access/remove`, {
    method: 'POST',
    body: JSON.stringify({
      user_ids: payload.user_ids || [],
      team_ids: payload.team_ids || [],
    }),
  });
}

export async function fetchSkillRegistry(): Promise<SkillRegistryItem[]> {
  const data = await request<{ skills: SkillRegistryItem[] }>('/skills/registry');
  return data.skills;
}

export async function updateSkillState(skillId: string, isEnabled: boolean) {
  clearCache('/skills');
  return request<{ skill_id: string; is_enabled: boolean; updated_at: string }>(`/skills/${skillId}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ is_enabled: isEnabled }),
  });
}

export async function getSkill(skillId: string): Promise<SkillRegistryItem> {
  return request<SkillRegistryItem>(`/skills/${skillId}`);
}

export async function deleteSkill(skillId: string): Promise<{ deleted: boolean; skill_id: string; message: string }> {
  clearCache('/skills');
  return request<{ deleted: boolean; skill_id: string; message: string }>(`/skills/${skillId}`, {
    method: 'DELETE',
  });
}

export async function createSkill(payload: {
  skill_id: string;
  display_name: string;
  description: string;
  skill_type?: string;
  domain?: string;
  instructions?: string;
  required_models?: string[];
  version?: string;
  is_enabled?: boolean;
  input_schema?: Record<string, unknown>;
  output_format?: Record<string, unknown>;
  execution_handler?: string;
  error_handling?: Record<string, unknown>;
}): Promise<SkillRegistryItem> {
  clearCache('/skills');
  return request<SkillRegistryItem>('/skills', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSkill(skillId: string, payload: {
  display_name?: string;
  description?: string;
  instructions?: string;
  required_models?: string[];
  skill_type?: string;
  domain?: string;
  version?: string;
  is_enabled?: boolean;
  input_schema?: Record<string, unknown>;
  output_format?: Record<string, unknown>;
  execution_handler?: string;
  error_handling?: Record<string, unknown>;
}): Promise<SkillRegistryItem> {
  clearCache('/skills');
  return request<SkillRegistryItem>(`/skills/${skillId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ── Models ─────────────────────────────────────────────────────────

export interface ModelItem {
  model_id: string;
  display_name: string;
  provider: string;
  tier: string;
  is_available: boolean;
  access: { granted_at: string; expires_at: string | null; is_active: boolean } | null;
}

export interface SecretReferenceItem {
  reference_key: string;
  provider: string;
  is_active: boolean;
  created_at: string;
}

export interface ModelConfigurationItem {
  id: string;
  model_id: string;
  provider: string;
  base_url: string;
  secret_reference_key: string;
  temperature: number;
  max_tokens: number;
  request_timeout_seconds: number;
  parameters: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export async function fetchModels(): Promise<ModelItem[]> {
  const data = await request<{ models: ModelItem[] }>('/models');
  return data.models;
}

export async function assignModel(userId: string, modelId: string, expiresAt?: string, notes?: string) {
  clearCache('/models');
  return request('/models/assign', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, model_id: modelId, expires_at: expiresAt || null, notes: notes || null }),
  });
}

export async function revokeModel(userId: string, modelId: string) {
  clearCache('/models');
  return request('/models/revoke', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, model_id: modelId }),
  });
}

export async function listSecretReferences(): Promise<SecretReferenceItem[]> {
  const data = await request<{ references: SecretReferenceItem[] }>('/models/secrets');
  return data.references;
}

export async function createSecretReference(payload: {
  reference_key: string;
  provider: string;
  secret_value: string;
}): Promise<SecretReferenceItem> {
  return request<SecretReferenceItem>('/models/secrets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listModelConfigurations(): Promise<ModelConfigurationItem[]> {
  const data = await request<{ configs: ModelConfigurationItem[] }>('/models/config');
  return data.configs;
}

export async function createModelConfiguration(payload: {
  model_id: string;
  provider: string;
  base_url: string;
  secret_reference_key: string;
  temperature?: number;
  max_tokens?: number;
  request_timeout_seconds?: number;
  parameters?: Record<string, unknown>;
}): Promise<ModelConfigurationItem> {
  clearCache('/models/config');
  return request<ModelConfigurationItem>('/models/config', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateModelConfiguration(configId: string, payload: {
  base_url?: string;
  secret_reference_key?: string;
  temperature?: number;
  max_tokens?: number;
  request_timeout_seconds?: number;
  parameters?: Record<string, unknown>;
  is_active?: boolean;
}): Promise<ModelConfigurationItem> {
  clearCache('/models/config');
  return request<ModelConfigurationItem>(`/models/config/${configId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteModelConfiguration(configId: string): Promise<{ deleted: boolean; id: string }> {
  clearCache('/models/config');
  return request<{ deleted: boolean; id: string }>(`/models/config/${configId}`, {
    method: 'DELETE',
  });
}

export async function validateModelConfiguration(payload: {
  provider: string;
  base_url: string;
  secret_reference_key: string;
}): Promise<{ valid: boolean; provider: string; base_url: string; latency_ms: number; message: string }> {
  return request('/models/config/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Users ──────────────────────────────────────────────────────────

export interface UserItem {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  allowed_models: string[];
  allowed_skills: string[];
}

export interface UserAccessConfig {
  user_id: string;
  skill_ids: string[];
  model_ids: string[];
  team_ids: string[];
}

export async function fetchUsers(): Promise<UserItem[]> {
  const data = await request<{ users: UserItem[] }>('/users');
  return data.users;
}

export interface UserInviteResponse {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  temp_password: string;
  created_at: string;
}

export async function inviteUser(payload: {
  email: string;
  display_name?: string;
  role?: string;
}): Promise<UserInviteResponse> {
  clearCache('/users');
  return request<UserInviteResponse>('/users/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUserRole(userId: string, role: string): Promise<{ user_id: string; role: string; updated_at: string }> {
  clearCache('/users');
  return request<{ user_id: string; role: string; updated_at: string }>(`/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function updateUserStatus(userId: string, isActive: boolean): Promise<{ user_id: string; is_active: boolean; updated_at: string }> {
  clearCache('/users');
  return request<{ user_id: string; is_active: boolean; updated_at: string }>(`/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function fetchUserAccess(userId: string): Promise<UserAccessConfig> {
  return request<UserAccessConfig>(`/users/${userId}/access`);
}

export async function addUserAccess(userId: string, payload: {
  skill_ids?: string[];
  model_ids?: string[];
  team_ids?: string[];
}): Promise<UserAccessConfig> {
  clearCache('/users');
  clearCache('/teams');
  clearCache('/skills');
  clearCache('/models');
  return request<UserAccessConfig>(`/users/${userId}/access/add`, {
    method: 'POST',
    body: JSON.stringify({
      skill_ids: payload.skill_ids || [],
      model_ids: payload.model_ids || [],
      team_ids: payload.team_ids || [],
    }),
  });
}

export async function removeUserAccess(userId: string, payload: {
  skill_ids?: string[];
  model_ids?: string[];
  team_ids?: string[];
}): Promise<UserAccessConfig> {
  clearCache('/users');
  clearCache('/teams');
  clearCache('/skills');
  clearCache('/models');
  return request<UserAccessConfig>(`/users/${userId}/access/remove`, {
    method: 'POST',
    body: JSON.stringify({
      skill_ids: payload.skill_ids || [],
      model_ids: payload.model_ids || [],
      team_ids: payload.team_ids || [],
    }),
  });
}

// ── Teams ──────────────────────────────────────────────────────────

export interface TeamItem {
  team_id: string;
  name: string;
  description: string;
  member_count: number;
  created_at: string;
}

export interface TeamAccessConfig {
  team_id: string;
  user_ids: string[];
  skill_ids: string[];
  model_ids: string[];
}

export async function fetchTeams(): Promise<TeamItem[]> {
  const data = await request<{ teams: TeamItem[]; total: number }>('/teams');
  return data.teams;
}

export async function createTeam(payload: { name: string; description?: string }): Promise<TeamItem> {
  clearCache('/teams');
  return request<TeamItem>('/teams', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTeam(teamId: string, payload: { name?: string; description?: string }): Promise<TeamItem> {
  clearCache('/teams');
  return request<TeamItem>(`/teams/${teamId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteTeam(teamId: string): Promise<{ deleted: boolean; team_id: string }> {
  clearCache('/teams');
  return request<{ deleted: boolean; team_id: string }>(`/teams/${teamId}`, {
    method: 'DELETE',
  });
}

export async function fetchTeamAccess(teamId: string): Promise<TeamAccessConfig> {
  return request<TeamAccessConfig>(`/teams/${teamId}/access`);
}

export async function updateTeamAccess(teamId: string, payload: {
  user_ids: string[];
  skill_ids: string[];
  model_ids: string[];
}): Promise<TeamAccessConfig> {
  clearCache('/teams');
  return request<TeamAccessConfig>(`/teams/${teamId}/access`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ── Settings ───────────────────────────────────────────────────────

export interface OrgSettings {
  org_name: string;
  org_domain: string;
  default_region: string;
  notifications: Record<string, boolean>;
  appearance?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
}

export async function fetchSettings(): Promise<OrgSettings> {
  return request<OrgSettings>('/settings');
}

export async function updateSettings(payload: Partial<OrgSettings>): Promise<OrgSettings> {
  clearCache('/settings');
  return request<OrgSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ── Monitoring ─────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  request_id: string;
  user_id: string | null;
  skill_id: string | null;
  model_id: string | null;
  action: string;
  outcome: string;
  tokens_used: number | null;
  latency_ms: number | null;
  timestamp: string;
}

export interface MonitoringData {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    total_executions: number;
    total_denials: number;
    total_tokens: number;
    avg_latency_ms: number;
  };
}

export async function fetchMonitoring(params?: {
  page?: number;
  page_size?: number;
  action?: string;
  model_id?: string;
  skill_id?: string;
  user_id?: string;
}): Promise<MonitoringData> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.page_size) query.set('page_size', String(params.page_size));
  if (params?.action) query.set('action', params.action);
  if (params?.model_id) query.set('model_id', params.model_id);
  if (params?.skill_id) query.set('skill_id', params.skill_id);
  if (params?.user_id) query.set('user_id', params.user_id);
  const qs = query.toString();
  return request<MonitoringData>(`/monitoring${qs ? '?' + qs : ''}`);
}

// ── Execute ────────────────────────────────────────────────────────

export async function executeModel(skillId: string, modelId: string, prompt: string, maxTokens = 500) {
  return request<{ result: string; model_id: string; skill_id: string; tokens_used: number; latency_ms: number; finish_reason: string; request_id: string }>(
    '/execute',
    {
      method: 'POST',
      body: JSON.stringify({ skill_id: skillId, model_id: modelId, prompt, max_tokens: maxTokens }),
    },
  );
}

// ── Health ─────────────────────────────────────────────────────────

export async function fetchHealth() {
  return request<{ status: string; database: string; redis: string }>('/health');
}
