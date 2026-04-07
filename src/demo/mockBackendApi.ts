import { demoDelay } from './demoMode';
import { demoStore } from './demoStore';
import type { MonitoringData } from '../services/backendApi';

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

export async function mockBackendRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  await demoDelay();
  const method = String(options.method || 'GET').toUpperCase();
  const body = parseBody(options);
  const { pathname, searchParams } = splitPath(path);

  // Health
  if (method === 'GET' && pathname === '/health') {
    return { status: 'ok', database: 'connected', redis: 'in-memory' } as T;
  }

  // Skills
  if (method === 'GET' && pathname === '/skills') {
    return { skills: demoStore.listSkills() } as T;
  }
  if (method === 'GET' && pathname === '/skills/registry') {
    return { skills: demoStore.listSkillRegistry() } as T;
  }
  if (method === 'GET' && pathname.startsWith('/skills/') && pathname.split('/').length === 3) {
    const skillId = pathname.split('/')[2] || '';
    const item = demoStore.getSkillRegistry(skillId);
    if (!item) throw new Error(`Skill not found: ${skillId}`);
    return item as T;
  }
  if (method === 'PATCH' && pathname.endsWith('/state') && pathname.startsWith('/skills/')) {
    const skillId = pathname.split('/')[2] || '';
    const isEnabled = !!body?.is_enabled;
    const item = demoStore.setSkillEnabled(skillId, isEnabled);
    if (!item) throw new Error(`Skill not found: ${skillId}`);
    return { skill_id: skillId, is_enabled: isEnabled, updated_at: new Date().toISOString() } as T;
  }
  if (method === 'DELETE' && pathname.startsWith('/skills/')) {
    const skillId = pathname.split('/')[2] || '';
    demoStore.deleteSkill(skillId);
    return { deleted: true, skill_id: skillId, message: 'Deleted (demo mode).' } as T;
  }
  if (method === 'POST' && pathname === '/skills/assign') {
    const userId = String(body?.user_id || '');
    const skillId = String(body?.skill_id || '');
    const expiresAt = body?.expires_at ? String(body.expires_at) : null;
    const result = demoStore.assignSkill(userId, skillId, expiresAt);
    return { user_id: userId, skill_id: skillId, ...result, is_active: true } as T;
  }
  if (method === 'POST' && pathname === '/skills/revoke') {
    const userId = String(body?.user_id || '');
    const skillId = String(body?.skill_id || '');
    const result = demoStore.revokeSkill(userId, skillId);
    return { user_id: userId, skill_id: skillId, ...result, is_active: false } as T;
  }
  if (method === 'GET' && pathname.startsWith('/skills/') && pathname.endsWith('/access')) {
    const skillId = pathname.split('/')[2] || '';
    return demoStore.getSkillAccess(skillId) as T;
  }
  if (method === 'POST' && pathname.startsWith('/skills/') && pathname.endsWith('/access/add')) {
    const skillId = pathname.split('/')[2] || '';
    return demoStore.addSkillAccess(skillId, {
      user_ids: Array.isArray(body?.user_ids) ? body.user_ids : [],
      team_ids: Array.isArray(body?.team_ids) ? body.team_ids : [],
    }) as T;
  }
  if (method === 'POST' && pathname.startsWith('/skills/') && pathname.endsWith('/access/remove')) {
    const skillId = pathname.split('/')[2] || '';
    return demoStore.removeSkillAccess(skillId, {
      user_ids: Array.isArray(body?.user_ids) ? body.user_ids : [],
      team_ids: Array.isArray(body?.team_ids) ? body.team_ids : [],
    }) as T;
  }

  // Models
  if (method === 'GET' && pathname === '/models') {
    return { models: demoStore.listModels() } as T;
  }
  if (method === 'POST' && pathname === '/models/assign') {
    const userId = String(body?.user_id || '');
    const modelId = String(body?.model_id || '');
    const expiresAt = body?.expires_at ? String(body.expires_at) : null;
    const result = demoStore.assignModel(userId, modelId, expiresAt);
    return { user_id: userId, model_id: modelId, ...result, is_active: true } as T;
  }
  if (method === 'POST' && pathname === '/models/revoke') {
    const userId = String(body?.user_id || '');
    const modelId = String(body?.model_id || '');
    const result = demoStore.revokeModel(userId, modelId);
    return { user_id: userId, model_id: modelId, ...result, is_active: false } as T;
  }
  if (method === 'GET' && pathname === '/models/secrets') {
    return { references: demoStore.listSecretReferences() } as T;
  }
  if (method === 'POST' && pathname === '/models/secrets') {
    const created = demoStore.createSecretReference({
      reference_key: String(body?.reference_key || ''),
      provider: String(body?.provider || 'custom'),
    });
    return created as T;
  }
  if (method === 'GET' && pathname === '/models/config') {
    return { configs: demoStore.listModelConfigurations() } as T;
  }
  if (method === 'POST' && pathname === '/models/config') {
    const created = demoStore.createModelConfiguration({
      model_id: String(body?.model_id || ''),
      provider: String(body?.provider || 'custom'),
      base_url: String(body?.base_url || ''),
      secret_reference_key: String(body?.secret_reference_key || ''),
      temperature: Number(body?.temperature ?? 0.2),
      max_tokens: Number(body?.max_tokens ?? 2048),
      request_timeout_seconds: Number(body?.request_timeout_seconds ?? 45),
      parameters: body?.parameters || {},
    } as any);
    return created as T;
  }
  if ((method === 'PUT' || method === 'DELETE') && pathname.startsWith('/models/config/')) {
    const configId = pathname.split('/')[3] || '';
    if (method === 'DELETE') {
      demoStore.deleteModelConfiguration(configId);
      return { deleted: true, id: configId } as T;
    }
    const updated = demoStore.updateModelConfiguration(configId, body || {});
    if (!updated) throw new Error(`Config not found: ${configId}`);
    return updated as T;
  }
  if (method === 'POST' && pathname === '/models/config/validate') {
    return {
      valid: true,
      provider: body?.provider || 'custom',
      base_url: body?.base_url || '',
      latency_ms: 84,
      message: 'Validated (demo mode).',
    } as T;
  }

  // Users
  if (method === 'GET' && pathname === '/users') {
    return { users: demoStore.listUsers() } as T;
  }
  if (method === 'POST' && pathname === '/users/invite') {
    return demoStore.inviteUser({
      email: String(body?.email || ''),
      display_name: body?.display_name ? String(body.display_name) : undefined,
      role: body?.role ? String(body.role) : undefined,
    }) as T;
  }
  if (method === 'PATCH' && pathname.endsWith('/role') && pathname.startsWith('/users/')) {
    const userId = pathname.split('/')[2] || '';
    const role = String(body?.role || 'user');
    const updated = demoStore.updateUserRole(userId, role);
    if (!updated) throw new Error(`User not found: ${userId}`);
    return { user_id: userId, role, updated_at: new Date().toISOString() } as T;
  }
  if (method === 'PATCH' && pathname.endsWith('/status') && pathname.startsWith('/users/')) {
    const userId = pathname.split('/')[2] || '';
    const isActive = !!body?.is_active;
    const updated = demoStore.updateUserStatus(userId, isActive);
    if (!updated) throw new Error(`User not found: ${userId}`);
    return { user_id: userId, is_active: isActive, updated_at: new Date().toISOString() } as T;
  }
  if (method === 'GET' && pathname.startsWith('/users/') && pathname.endsWith('/access')) {
    const userId = pathname.split('/')[2] || '';
    return demoStore.getUserAccess(userId) as T;
  }
  if (method === 'POST' && pathname.startsWith('/users/') && pathname.endsWith('/access/add')) {
    const userId = pathname.split('/')[2] || '';
    return demoStore.addUserAccess(userId, {
      skill_ids: Array.isArray(body?.skill_ids) ? body.skill_ids : [],
      model_ids: Array.isArray(body?.model_ids) ? body.model_ids : [],
      team_ids: Array.isArray(body?.team_ids) ? body.team_ids : [],
    }) as T;
  }
  if (method === 'POST' && pathname.startsWith('/users/') && pathname.endsWith('/access/remove')) {
    const userId = pathname.split('/')[2] || '';
    return demoStore.removeUserAccess(userId, {
      skill_ids: Array.isArray(body?.skill_ids) ? body.skill_ids : [],
      model_ids: Array.isArray(body?.model_ids) ? body.model_ids : [],
      team_ids: Array.isArray(body?.team_ids) ? body.team_ids : [],
    }) as T;
  }

  // Teams
  if (method === 'GET' && pathname === '/teams') {
    const teams = demoStore.listTeams();
    return { teams, total: teams.length } as T;
  }
  if (method === 'POST' && pathname === '/teams') {
    return demoStore.createTeam({
      name: String(body?.name || 'New Team'),
      description: body?.description ? String(body.description) : undefined,
    }) as T;
  }
  if (method === 'GET' && pathname.startsWith('/teams/') && pathname.endsWith('/access')) {
    const teamId = pathname.split('/')[2] || '';
    return demoStore.getTeamAccess(teamId) as T;
  }
  if (method === 'PUT' && pathname.startsWith('/teams/') && pathname.endsWith('/access')) {
    const teamId = pathname.split('/')[2] || '';
    return demoStore.updateTeamAccess(teamId, {
      user_ids: Array.isArray(body?.user_ids) ? body.user_ids : [],
      skill_ids: Array.isArray(body?.skill_ids) ? body.skill_ids : [],
      model_ids: Array.isArray(body?.model_ids) ? body.model_ids : [],
    }) as T;
  }
  if ((method === 'PUT' || method === 'DELETE') && pathname.startsWith('/teams/')) {
    const teamId = pathname.split('/')[2] || '';
    if (method === 'DELETE') {
      demoStore.deleteTeam(teamId);
      return { deleted: true, team_id: teamId } as T;
    }
    const updated = demoStore.updateTeam(teamId, body || {});
    if (!updated) throw new Error(`Team not found: ${teamId}`);
    return updated as T;
  }

  // Settings
  if (method === 'GET' && pathname === '/settings') {
    return demoStore.getSettings() as T;
  }
  if (method === 'PUT' && pathname === '/settings') {
    return demoStore.updateSettings(body || {}) as T;
  }

  // Monitoring
  if (method === 'GET' && pathname === '/monitoring') {
    const logs = demoStore.listAuditLogs();
    const pageSize = Number(searchParams.get('page_size') || '100');
    const page = Number(searchParams.get('page') || '1');
    const action = searchParams.get('action');
    const modelId = searchParams.get('model_id');
    const skillId = searchParams.get('skill_id');
    const userId = searchParams.get('user_id');

    let filtered = logs;
    if (action) filtered = filtered.filter((l) => l.action === action);
    if (modelId) filtered = filtered.filter((l) => l.model_id === modelId);
    if (skillId) filtered = filtered.filter((l) => l.skill_id === skillId);
    if (userId) filtered = filtered.filter((l) => l.user_id === userId);

    const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.min(500, pageSize)) : 100;
    const safePage = Number.isFinite(page) ? Math.max(1, page) : 1;
    const start = (safePage - 1) * safePageSize;
    const slice = filtered.slice(start, start + safePageSize);

    const tokenSum = slice.reduce((sum, l) => sum + (l.tokens_used || 0), 0);
    const latencies = slice.map((l) => l.latency_ms).filter((v): v is number => typeof v === 'number');
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const denials = slice.filter((l) => l.outcome === 'denied').length;

    const result: MonitoringData = {
      logs: slice,
      total: filtered.length,
      page: safePage,
      page_size: safePageSize,
      summary: {
        total_executions: slice.filter((l) => l.action === 'execute').length,
        total_denials: denials,
        total_tokens: tokenSum,
        avg_latency_ms: avgLatency,
      },
    };
    return result as T;
  }

  // Execute
  if (method === 'POST' && pathname === '/execute') {
    const skillId = String(body?.skill_id || 'demo-skill');
    const modelId = String(body?.model_id || 'gpt-4o-mini');
    const prompt = String(body?.prompt || '');
    const tokensUsed = Math.min(4500, 250 + Math.floor(prompt.length * 1.2));
    const latencyMs = 180 + Math.floor(Math.random() * 450);
    return {
      result: [
        `Demo response for skill=${skillId}, model=${modelId}.`,
        '',
        'Summary:',
        '- Returned plausible output (demo mode).',
        '- This does not call any real model provider.',
      ].join('\n'),
      model_id: modelId,
      skill_id: skillId,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
      finish_reason: 'stop',
      request_id: `demo_req_${Date.now()}`,
    } as T;
  }

  throw new Error(`Demo mode: unhandled backend route ${method} ${pathname}`);
}
