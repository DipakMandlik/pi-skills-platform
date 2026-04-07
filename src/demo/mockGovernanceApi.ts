import { demoDelay } from './demoMode';
import { demoStore } from './demoStore';

function parseBody(options: RequestInit): any {
  if (!options.body) return null;
  if (typeof options.body === 'string') {
    try { return JSON.parse(options.body); } catch { return null; }
  }
  return null;
}

function splitPath(path: string): { pathname: string; searchParams: URLSearchParams } {
  const url = new URL(path, 'http://demo.local');
  return { pathname: url.pathname, searchParams: url.searchParams };
}

export async function mockGovernanceRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  await demoDelay();
  const method = String(options.method || 'GET').toUpperCase();
  const body = parseBody(options);
  const { pathname, searchParams } = splitPath(path);

  // AI endpoints
  if (method === 'GET' && pathname === '/governance/ai/dashboard') {
    return demoStore.getUserDashboard() as T;
  }
  if (method === 'GET' && pathname === '/governance/ai/tokens') {
    return { usage: demoStore.getTokenUsage(), stats: { model_breakdown: [] } } as T;
  }
  if (method === 'POST' && pathname === '/governance/ai/validate') {
    return { valid: true, message: 'Validated (demo mode).' } as T;
  }
  if (method === 'POST' && pathname === '/governance/ai/request') {
    return {
      status: 'ok',
      request_id: `demo_gov_${Date.now()}`,
      result: 'Approved and processed (demo mode).',
      model_id: body?.model_id || 'gpt-4o-mini',
      tokens_used: 420,
      cost: 0.02,
      latency_ms: 220,
      finish_reason: 'stop',
      remaining_tokens: Math.max(0, (demoStore.getTokenUsage().remaining_tokens || 0) - 420),
    } as T;
  }
  if (method === 'POST' && pathname === '/governance/access-requests') {
    return demoStore.createAccessRequest({
      resource_type: String(body?.resource_type || 'model'),
      resource_id: String(body?.resource_id || ''),
      reason: body?.reason ? String(body.reason) : undefined,
      metadata: body?.metadata || undefined,
    }) as T;
  }

  // Admin subscriptions
  if (method === 'GET' && pathname === '/governance/admin/subscriptions') {
    const items = demoStore.listSubscriptions();
    return { subscriptions: items, total: items.length } as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/subscriptions') {
    return demoStore.createSubscription(body) as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/subscriptions/assign') {
    return { user_id: body?.user_id || '', plan_name: body?.plan_name || 'enterprise-default', assigned_at: new Date().toISOString() } as T;
  }
  if (method === 'GET' && pathname.startsWith('/governance/admin/subscriptions/user/')) {
    const userId = pathname.split('/').pop() || '';
    const plan = demoStore.listSubscriptions()[0];
    return { user_id: userId, plan_name: plan?.plan_name || 'enterprise-default', assigned_at: new Date().toISOString(), plan_details: plan } as T;
  }

  // Admin model access
  if (method === 'GET' && pathname === '/governance/admin/model-access') {
    const configs = demoStore.listModelAccess();
    return { configs, total: configs.length } as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/model-access') {
    return demoStore.setModelAccess(body) as T;
  }
  if (method === 'GET' && pathname.startsWith('/governance/admin/model-access/')) {
    const modelId = pathname.split('/').pop() || '';
    const cfg = demoStore.listModelAccess().find((c) => c.model_id === modelId);
    if (!cfg) throw new Error(`Model access not found: ${modelId}`);
    return cfg as T;
  }

  // Admin feature flags
  if (method === 'GET' && pathname === '/governance/admin/feature-flags') {
    const modelId = searchParams.get('model_id');
    const flags = demoStore.listFeatureFlags().filter((f) => !modelId || f.model_id === modelId);
    return { flags, total: flags.length } as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/feature-flags') {
    return demoStore.setFeatureFlag(body) as T;
  }

  // Admin policies
  if (method === 'GET' && pathname === '/governance/admin/policies') {
    const policyType = searchParams.get('policy_type');
    const enabledOnly = searchParams.get('enabled_only') === 'true';
    let policies = demoStore.listPolicies();
    if (policyType) policies = policies.filter((p) => p.policy_type === policyType);
    if (enabledOnly) policies = policies.filter((p) => p.enabled);
    return { policies, total: policies.length } as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/policies') {
    return demoStore.createPolicy(body) as T;
  }
  if (method === 'DELETE' && pathname.startsWith('/governance/admin/policies/')) {
    const policyName = decodeURIComponent(pathname.split('/').pop() || '');
    const deleted = demoStore.deletePolicy(policyName);
    return { deleted, message: deleted ? 'Deleted (demo mode).' : 'Not found.' } as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/policies/evaluate') {
    return { allowed: true, violations: [], warnings: [], policies_evaluated: demoStore.listPolicies().length } as T;
  }

  // Admin access requests
  if (method === 'GET' && pathname === '/governance/admin/access-requests') {
    const status = searchParams.get('status') || undefined;
    const requests = demoStore.listAccessRequests(status);
    return { requests, total: requests.length } as T;
  }
  if (method === 'POST' && pathname.endsWith('/approve') && pathname.includes('/governance/admin/access-requests/')) {
    const parts = pathname.split('/');
    const requestId = parts[parts.length - 2] || '';
    const approved = demoStore.approveAccessRequest(requestId, body?.expires_at);
    if (!approved) throw new Error(`Access request not found: ${requestId}`);
    return approved as T;
  }
  if (method === 'POST' && pathname.endsWith('/reject') && pathname.includes('/governance/admin/access-requests/')) {
    const parts = pathname.split('/');
    const requestId = parts[parts.length - 2] || '';
    const rejected = demoStore.rejectAccessRequest(requestId, body?.reason);
    if (!rejected) throw new Error(`Access request not found: ${requestId}`);
    return rejected as T;
  }

  // Admin tokens
  if (method === 'GET' && pathname === '/governance/admin/tokens/global-stats') {
    const period = searchParams.get('period') || demoStore.getTokenUsage().period;
    const usage = demoStore.getTokenUsage();
    return {
      period,
      total_tokens: usage.tokens_used,
      total_cost: usage.cost_accumulated,
      total_requests: 132,
      unique_users: 18,
      model_breakdown: [],
    } as T;
  }
  if (method === 'GET' && pathname === '/governance/admin/tokens/logs') {
    return { logs: [], total: 0, offset: Number(searchParams.get('offset') || 0), limit: Number(searchParams.get('limit') || 50) } as T;
  }
  if (method === 'POST' && pathname === '/governance/admin/tokens/reset') {
    demoStore.setTokenUsage({ tokens_limit: Number(body?.new_limit ?? demoStore.getTokenUsage().tokens_limit) });
    return { status: 'ok', user_id: body?.user_id || '', period: demoStore.getTokenUsage().period, new_limit: Number(body?.new_limit ?? 0) } as T;
  }

  // Admin overview
  if (method === 'GET' && pathname === '/governance/admin/overview') {
    const subscriptions = demoStore.listSubscriptions();
    const model_access_configs = demoStore.listModelAccess();
    return {
      subscriptions,
      model_access_configs,
      total_subscriptions: subscriptions.length,
      total_models_configured: model_access_configs.length,
    } as T;
  }

  throw new Error(`Demo mode: unhandled governance route ${method} ${pathname}`);
}

