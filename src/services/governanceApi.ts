import { apiClient } from './apiClient';

export interface GovernanceRequest {
  prompt: string;
  model_id?: string;
  task_type?: string;
  skill_id?: string;
  max_tokens?: number;
  parameters?: Record<string, unknown>;
}

export interface GovernanceResponse {
  status: string;
  request_id: string;
  result?: string;
  model_id?: string;
  tokens_used?: number;
  cost?: number;
  latency_ms: number;
  finish_reason?: string;
  remaining_tokens?: number;
  reason?: string;
  message?: string;
  error?: string;
}

export interface Subscription {
  plan_name: string;
  display_name: string;
  monthly_token_limit: number;
  max_tokens_per_request: number;
  allowed_models: string[];
  features: string[];
  priority: string;
  rate_limit_per_minute: number;
  cost_budget_monthly: number;
}

export interface ModelAccessControl {
  model_id: string;
  allowed_roles: string[];
  max_tokens_per_request: number;
  enabled: boolean;
  rate_limit_per_minute: number;
}

export interface FeatureFlag {
  feature_name: string;
  model_id: string;
  enabled: boolean;
  enabled_for: string[];
  config: Record<string, unknown>;
}

export interface TokenUsage {
  user_id: string;
  period: string;
  tokens_used: number;
  tokens_limit: number;
  cost_accumulated: number;
  remaining_tokens: number;
}

export interface UserDashboard {
  user_id: string;
  subscription: Subscription | null;
  token_usage: TokenUsage | null;
  usage_stats: {
    user_id: string;
    period: string;
    model_breakdown: Array<{
      model_id: string;
      total_tokens: number;
      total_cost: number;
      request_count: number;
    }>;
  } | null;
}

export interface Policy {
  id: string;
  policy_name: string;
  policy_type: string;
  description: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  priority: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AccessRequest {
  request_id: string;
  requester: string;
  resource_type: string;
  resource_id: string;
  status: string;
  requested_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export const governanceApi = {
  async sendRequest(data: GovernanceRequest): Promise<GovernanceResponse> {
    return apiClient<GovernanceResponse>('/governance/ai/request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async validateRequest(data: {
    model_id?: string;
    task_type?: string;
    estimated_tokens?: number;
  }): Promise<{ valid: boolean; reason?: string; message?: string }> {
    return apiClient('/governance/ai/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getDashboard(): Promise<UserDashboard> {
    return apiClient<UserDashboard>('/governance/ai/dashboard');
  },

  async getTokenUsage(): Promise<{
    usage: TokenUsage | null;
    stats: { model_breakdown: Array<unknown> } | null;
  }> {
    return apiClient('/governance/ai/tokens');
  },

  async createAccessRequest(payload: {
    resource_type: string;
    resource_id: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AccessRequest> {
    return apiClient<AccessRequest>('/governance/access-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const adminApi = {
  async createSubscription(data: Omit<Subscription, 'plan_name'> & { plan_name: string }): Promise<Subscription> {
    return apiClient<Subscription>('/governance/admin/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listSubscriptions(): Promise<{ subscriptions: Subscription[]; total: number }> {
    return apiClient('/governance/admin/subscriptions');
  },

  async assignSubscription(user_id: string, plan_name: string): Promise<{ user_id: string; plan_name: string; assigned_at: string }> {
    return apiClient('/governance/admin/subscriptions/assign', {
      method: 'POST',
      body: JSON.stringify({ user_id, plan_name }),
    });
  },

  async getUserSubscription(user_id: string): Promise<{ user_id: string; plan_name: string; assigned_at: string; plan_details: Subscription }> {
    return apiClient(`/governance/admin/subscriptions/user/${user_id}`);
  },

  async setModelAccess(data: ModelAccessControl): Promise<ModelAccessControl> {
    return apiClient<ModelAccessControl>('/governance/admin/model-access', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listModelAccess(): Promise<{ configs: ModelAccessControl[]; total: number }> {
    return apiClient('/governance/admin/model-access');
  },

  async getModelAccess(model_id: string): Promise<ModelAccessControl> {
    return apiClient<ModelAccessControl>(`/governance/admin/model-access/${model_id}`);
  },

  async setFeatureFlag(data: FeatureFlag): Promise<FeatureFlag> {
    return apiClient<FeatureFlag>('/governance/admin/feature-flags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listFeatureFlags(model_id?: string): Promise<{ flags: FeatureFlag[]; total: number }> {
    const query = model_id ? `?model_id=${model_id}` : '';
    return apiClient(`/governance/admin/feature-flags${query}`);
  },

  async listAccessRequests(status?: string): Promise<{ requests: AccessRequest[]; total: number }> {
    const query = status ? `?status=${status}` : '';
    return apiClient(`/governance/admin/access-requests${query}`);
  },

  async approveAccessRequest(request_id: string, expires_at?: string): Promise<AccessRequest> {
    return apiClient(`/governance/admin/access-requests/${request_id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ expires_at }),
    });
  },

  async rejectAccessRequest(request_id: string, reason?: string): Promise<AccessRequest> {
    return apiClient(`/governance/admin/access-requests/${request_id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getSystemOverview(): Promise<{
    subscriptions: Subscription[];
    model_access_configs: ModelAccessControl[];
    total_subscriptions: number;
    total_models_configured: number;
  }> {
    return apiClient('/governance/admin/overview');
  },

  async listPolicies(policyType?: string, enabledOnly?: boolean): Promise<{ policies: Policy[]; total: number }> {
    const params = new URLSearchParams();
    if (policyType) params.set('policy_type', policyType);
    if (enabledOnly) params.set('enabled_only', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient(`/governance/admin/policies${query}`);
  },

  async createPolicy(data: Omit<Policy, 'id' | 'created_at' | 'updated_at'>): Promise<Policy> {
    return apiClient<Policy>('/governance/admin/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deletePolicy(policyName: string): Promise<{ deleted: boolean; message: string }> {
    return apiClient(`/governance/admin/policies/${policyName}`, { method: 'DELETE' });
  },

  async evaluatePolicies(data: {
    user_id: string;
    user_role: string;
    model_id: string;
    task_type?: string;
    estimated_tokens?: number;
    context?: Record<string, unknown>;
  }): Promise<{ allowed: boolean; violations: unknown[]; warnings: unknown[]; policies_evaluated: number }> {
    return apiClient('/governance/admin/policies/evaluate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getGlobalStats(period?: string): Promise<{
    period: string;
    total_tokens: number;
    total_cost: number;
    total_requests: number;
    unique_users: number;
    model_breakdown: unknown[];
  }> {
    const query = period ? `?period=${period}` : '';
    return apiClient(`/governance/admin/tokens/global-stats${query}`);
  },

  async getUsageLogs(params?: { user_id?: string; model_id?: string; limit?: number; offset?: number }): Promise<{
    logs: unknown[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const searchParams = new URLSearchParams();
    if (params?.user_id) searchParams.set('user_id', params.user_id);
    if (params?.model_id) searchParams.set('model_id', params.model_id);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiClient(`/governance/admin/tokens/logs${query}`);
  },

  async resetUserTokens(user_id: string, new_limit: number): Promise<{ status: string; user_id: string; period: string; new_limit: number }> {
    return apiClient('/governance/admin/tokens/reset', {
      method: 'POST',
      body: JSON.stringify({ user_id, new_limit }),
    });
  },
};
