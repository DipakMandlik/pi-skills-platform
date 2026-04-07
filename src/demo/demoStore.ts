import type {
  AuditLogEntry,
  ModelConfigurationItem,
  ModelItem,
  OrgSettings,
  SecretReferenceItem,
  SkillItem,
  SkillRegistryItem,
  TeamItem,
  UserInviteResponse,
  UserItem,
} from '../services/backendApi';
import type {
  AccessRequest,
  FeatureFlag,
  ModelAccessControl,
  Policy,
  Subscription,
  TokenUsage,
  UserDashboard,
} from '../services/governanceApi';

type DemoState = {
  skills: SkillItem[];
  skillRegistry: SkillRegistryItem[];
  models: ModelItem[];
  secretReferences: SecretReferenceItem[];
  modelConfigs: ModelConfigurationItem[];
  users: UserItem[];
  teams: TeamItem[];
  teamAccess: Record<string, { user_ids: string[]; skill_ids: string[]; model_ids: string[] }>;
  settings: OrgSettings;
  monitoringLogs: AuditLogEntry[];
  governance: {
    subscriptions: Subscription[];
    modelAccess: ModelAccessControl[];
    featureFlags: FeatureFlag[];
    policies: Policy[];
    tokenUsage: TokenUsage;
    accessRequests: AccessRequest[];
  };
};

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);
const now = Date.now();

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return isoAt(now - minutes * 60_000);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function id(prefix: string, n: number): string {
  return `${prefix}_${n.toString(36)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function makeSkills(): { registry: SkillRegistryItem[]; assigned: SkillItem[] } {
  const registry: SkillRegistryItem[] = [
    {
      skill_id: 'query-optimizer',
      display_name: 'Query Optimizer',
      description: 'Refines SQL for performance and correctness in Snowflake.',
      required_models: ['claude-3-haiku-20240307', 'gpt-4o-mini'],
      is_enabled: true,
      version: '1.2.0',
      domain: 'data',
      skill_type: 'assistant',
      instructions: 'Optimize SQL for Snowflake; prefer clarity and measurable improvements.',
      assignment_count: 12,
      input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
      output_format: { type: 'object', properties: { sql: { type: 'string' }, notes: { type: 'string' } } },
      execution_handler: 'governance.execute_llm',
      error_handling: { retries: 1, fallback: 'return_best_effort' },
      created_at: isoMinutesAgo(60 * 24 * 25),
      updated_at: isoMinutesAgo(60 * 2),
    },
    {
      skill_id: 'schema-explorer',
      display_name: 'Schema Explorer',
      description: 'Helps discover tables/columns and draft queries.',
      required_models: ['claude-3-haiku-20240307', 'gemini-1.5-flash'],
      is_enabled: true,
      version: '1.0.3',
      domain: 'data',
      skill_type: 'tooling',
      instructions: 'Ask clarifying questions and propose safe exploration queries.',
      assignment_count: 31,
      input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
      output_format: { type: 'object', properties: { answer: { type: 'string' }, sql: { type: 'string' } } },
      execution_handler: 'governance.execute_llm',
      error_handling: { retries: 1, fallback: 'ask_user' },
      created_at: isoMinutesAgo(60 * 24 * 12),
      updated_at: isoMinutesAgo(60 * 5),
    },
    {
      skill_id: 'data-quality-check',
      display_name: 'Data Quality Check',
      description: 'Generates quick DQ checks and anomaly queries.',
      required_models: ['gpt-4o', 'gemini-1.5-pro'],
      is_enabled: true,
      version: '0.9.1',
      domain: 'governance',
      skill_type: 'assistant',
      instructions: 'Generate DQ checks with clear thresholds and safe sampling.',
      assignment_count: 8,
      input_schema: { type: 'object', properties: { table: { type: 'string' } }, required: ['table'] },
      output_format: { type: 'object', properties: { checks: { type: 'array' } } },
      execution_handler: 'governance.execute_llm',
      error_handling: { retries: 0, fallback: 'return_partial' },
      created_at: isoMinutesAgo(60 * 24 * 5),
      updated_at: isoMinutesAgo(60 * 11),
    },
    {
      skill_id: 'access-request-drafter',
      display_name: 'Access Request Drafter',
      description: 'Drafts policy-compliant access requests with justification.',
      required_models: ['claude-3-5-sonnet-20241022', 'gpt-4o'],
      is_enabled: false,
      version: '0.4.0',
      domain: 'security',
      skill_type: 'assistant',
      instructions: 'Draft least-privilege access requests; include reason and duration.',
      assignment_count: 2,
      input_schema: { type: 'object', properties: { resource: { type: 'string' } }, required: ['resource'] },
      output_format: { type: 'object', properties: { request: { type: 'string' } } },
      execution_handler: 'governance.execute_llm',
      error_handling: { retries: 0, fallback: 'deny' },
      created_at: isoMinutesAgo(60 * 24 * 2),
      updated_at: isoMinutesAgo(60 * 24),
    },
  ];

  const assigned: SkillItem[] = registry.map((r, i) => ({
    skill_id: r.skill_id,
    display_name: r.display_name,
    description: r.description,
    required_models: r.required_models,
    is_active: r.is_enabled,
    version: r.version,
    assignment: i % 3 === 0
      ? { assigned_at: isoMinutesAgo(60 * 24 * (7 + i)), expires_at: null, is_active: true }
      : null,
  }));

  return { registry, assigned };
}

function makeModels(): ModelItem[] {
  const base: Array<Pick<ModelItem, 'model_id' | 'display_name' | 'provider' | 'tier' | 'is_available'>> = [
    { model_id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', provider: 'anthropic', tier: 'standard', is_available: true },
    { model_id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', provider: 'anthropic', tier: 'premium', is_available: true },
    { model_id: 'gpt-4o-mini', display_name: 'GPT-4o mini', provider: 'openai', tier: 'standard', is_available: true },
    { model_id: 'gpt-4o', display_name: 'GPT-4o', provider: 'openai', tier: 'premium', is_available: true },
    { model_id: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash', provider: 'google', tier: 'standard', is_available: true },
    { model_id: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', provider: 'google', tier: 'premium', is_available: true },
  ];

  return base.map((m, idx) => ({
    ...m,
    access: idx % 2 === 0
      ? { granted_at: isoMinutesAgo(60 * 24 * 10), expires_at: null, is_active: true }
      : null,
  }));
}

function makeUsers(models: ModelItem[], skills: SkillRegistryItem[]): UserItem[] {
  const modelIds = models.map((m) => m.model_id);
  const skillIds = skills.map((s) => s.skill_id);

  const people = [
    ['Bharat', 'Rao'],
    ['Chetan', 'Thorat'],
    ['Dipak', 'Mandlik'],
    ['Mayuri', 'Gawande'],
    ['Omkar', 'Wakchaure'],
    ['Renuka', 'Gavande'],
    ['Rushikesh', 'Joshi'],
    ['Asha', 'Nair'],
    ['Ravi', 'Kumar'],
    ['Priya', 'Sharma'],
  ];

  return people.map(([first, last], i) => {
    const uid = id('user', i + 1);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.corp`;
    const allowedModels = modelIds.filter((_, idx) => (idx + i) % 2 === 0).slice(0, 4);
    const allowedSkills = skillIds.filter((_, idx) => (idx + i) % 2 === 1).slice(0, 4);
    return {
      user_id: uid,
      email,
      display_name: `${first} ${last}`,
      role: i === 1 ? 'admin' : i % 3 === 0 ? 'viewer' : 'user',
      is_active: i % 7 !== 0,
      last_login_at: i % 4 === 0 ? null : isoMinutesAgo(60 * (2 + i * 7)),
      allowed_models: allowedModels,
      allowed_skills: allowedSkills,
    };
  });
}

function makeTeams(): TeamItem[] {
  return [
    {
      team_id: id('team', 1),
      name: 'Data Engineering',
      description: 'Warehouse pipelines, transformation jobs, and data platform reliability.',
      member_count: 7,
      created_at: isoMinutesAgo(60 * 24 * 120),
    },
    { team_id: id('team', 2), name: 'Platform Engineering', description: 'Core platform and reliability.', member_count: 0, created_at: isoMinutesAgo(60 * 24 * 90) },
    { team_id: id('team', 3), name: 'Analytics Engineering', description: 'Builds operational analytics skills and curated reporting workflows.', member_count: 0, created_at: isoMinutesAgo(60 * 24 * 60) },
    { team_id: id('team', 4), name: 'Support', description: 'Handles user support, incident triage, and operational escalations.', member_count: 0, created_at: isoMinutesAgo(60 * 24 * 55) },
    { team_id: id('team', 5), name: 'Security', description: 'RBAC, governance, and compliance.', member_count: 0, created_at: isoMinutesAgo(60 * 24 * 45) },
    { team_id: id('team', 6), name: 'Finance', description: 'Cost controls and reporting.', member_count: 0, created_at: isoMinutesAgo(60 * 24 * 30) },
    { team_id: id('team', 7), name: 'Product Engineering', description: 'Owns product features, delivery, and quality.', member_count: 0, created_at: isoMinutesAgo(60 * 24 * 20) },
  ];
}

function makeTeamAccess(teams: TeamItem[], users: UserItem[], models: ModelItem[], skills: SkillRegistryItem[]) {
  const byName = (name: string) => teams.find((t) => t.name === name)?.team_id;
  const userIdByEmail = (emailStartsWith: string) =>
    users.find((u) => u.email.startsWith(emailStartsWith))?.user_id;

  const analyticsSkill = skills.find((s) => s.skill_id === 'schema-explorer')?.skill_id || skills[0]?.skill_id || '';
  const optimizerSkill = skills.find((s) => s.skill_id === 'query-optimizer')?.skill_id || skills[0]?.skill_id || '';
  const dqSkill = skills.find((s) => s.skill_id === 'data-quality-check')?.skill_id || skills[0]?.skill_id || '';
  const standardModel = models.find((m) => m.model_id === 'gpt-4o-mini')?.model_id || models[0]?.model_id || '';
  const premiumModel = models.find((m) => m.model_id === 'gemini-1.5-pro')?.model_id || models[0]?.model_id || '';

  const access: Record<string, { user_ids: string[]; skill_ids: string[]; model_ids: string[] }> = {};
  for (const team of teams) {
    access[team.team_id] = { user_ids: [], skill_ids: [], model_ids: [] };
  }

  const dataEngineeringId = byName('Data Engineering');
  if (dataEngineeringId) {
    access[dataEngineeringId] = {
      user_ids: [
        userIdByEmail('bharat.rao'),
        userIdByEmail('chetan.thorat'),
        userIdByEmail('dipak.mandlik'),
        userIdByEmail('mayuri.gawande'),
        userIdByEmail('omkar.wakchaure'),
        userIdByEmail('renuka.gavande'),
        userIdByEmail('rushikesh.joshi'),
      ].filter(Boolean) as string[],
      skill_ids: [optimizerSkill, analyticsSkill, dqSkill].filter(Boolean),
      model_ids: [standardModel, premiumModel].filter(Boolean),
    };
  }

  const supportId = byName('Support');
  if (supportId) {
    access[supportId] = {
      user_ids: [userIdByEmail('asha.nair'), userIdByEmail('priya.sharma')].filter(Boolean) as string[],
      skill_ids: [analyticsSkill].filter(Boolean),
      model_ids: [standardModel].filter(Boolean),
    };
  }

  return access;
}

function makeSettings(): OrgSettings {
  return {
    org_name: 'Pi Skills Demo Org',
    org_domain: 'example.corp',
    default_region: 'us-east-1',
    notifications: {
      policy_alerts: true,
      weekly_summary: true,
      anomaly_detection: true,
    },
    appearance: {
      theme: 'system',
      accent: 'blue',
    },
    integrations: {
      snowflake: { enabled: true },
      mcp: { enabled: true },
    },
  };
}

function makeAuditLogs(users: UserItem[], skills: SkillRegistryItem[], models: ModelItem[]): AuditLogEntry[] {
  const actions = ['execute', 'validate', 'assign_skill', 'revoke_skill', 'policy_check', 'login'] as const;
  const outcomes = ['allowed', 'denied', 'success', 'error'] as const;

  const logs: AuditLogEntry[] = [];
  for (let i = 0; i < 42; i += 1) {
    const user = pick(users);
    const skill = pick(skills);
    const model = pick(models);
    const action = pick([...actions]);
    const outcome = pick([...outcomes]);
    const tokens = action === 'execute' ? Math.floor(rand() * 2500) + 250 : Math.floor(rand() * 250) + 20;
    const latency = Math.floor(rand() * 1400) + 120;

    logs.push({
      id: id('log', i + 1),
      request_id: id('req', 10_000 + i),
      user_id: user.user_id,
      skill_id: skill.skill_id,
      model_id: model.model_id,
      action,
      outcome,
      tokens_used: outcome === 'error' ? null : tokens,
      latency_ms: outcome === 'error' ? null : latency,
      timestamp: isoMinutesAgo(i * 13),
    });
  }
  return logs;
}

function makeGovernance(models: ModelItem[], users: UserItem[]): DemoState['governance'] {
  const subscriptions: Subscription[] = [
    {
      plan_name: 'enterprise-default',
      display_name: 'Enterprise Default',
      monthly_token_limit: 1_000_000,
      max_tokens_per_request: 4096,
      allowed_models: models.map((m) => m.model_id).slice(0, 4),
      features: ['workspace_assistant', 'governance_admin'],
      priority: 'standard',
      rate_limit_per_minute: 120,
      cost_budget_monthly: 2500,
    },
  ];

  const modelAccess: ModelAccessControl[] = models.map((m, i) => ({
    model_id: m.model_id,
    allowed_roles: i % 3 === 0 ? ['ACCOUNTADMIN', 'SYSADMIN'] : ['ALL'],
    max_tokens_per_request: i % 3 === 0 ? 4096 : 2048,
    enabled: true,
    rate_limit_per_minute: i % 3 === 0 ? 60 : 120,
  }));

  const featureFlags: FeatureFlag[] = [
    { feature_name: 'workspace_assistant', model_id: 'claude-3-haiku-20240307', enabled: true, enabled_for: ['ALL'], config: { rollout: 100 } },
    { feature_name: 'advanced_reasoning', model_id: 'claude-3-5-sonnet-20241022', enabled: true, enabled_for: ['ACCOUNTADMIN'], config: { rollout: 100 } },
    { feature_name: 'monitoring', model_id: 'gpt-4o-mini', enabled: true, enabled_for: ['ALL'], config: { rollout: 100 } },
    { feature_name: 'skills', model_id: 'gpt-4o-mini', enabled: true, enabled_for: ['ALL'], config: { rollout: 100 } },
  ];

  const policies: Policy[] = [
    {
      id: id('policy', 1),
      policy_name: 'default-token-guard',
      policy_type: 'token_limit',
      description: 'Warn or deny prompts that exceed the enterprise per-request token ceiling.',
      conditions: { estimated_tokens: { gt: 4096 } },
      actions: { deny: true, reason: 'Estimated token usage exceeds allowed limit.' },
      priority: 'high',
      enabled: true,
      created_at: isoMinutesAgo(60 * 24 * 10),
      updated_at: isoMinutesAgo(60 * 3),
    },
    {
      id: id('policy', 2),
      policy_name: 'admin-frontier-access',
      policy_type: 'model_access',
      description: 'Restrict frontier-only models to administrators.',
      conditions: { model_id: { in: ['claude-3-5-sonnet-20241022', 'gpt-4o'] }, user_role: { not_in: ['admin'] } },
      actions: { deny: true, reason: 'This model is reserved for administrators.' },
      priority: 'critical',
      enabled: true,
      created_at: isoMinutesAgo(60 * 24 * 8),
      updated_at: isoMinutesAgo(60 * 4),
    },
  ];

  const tokenUsage: TokenUsage = {
    user_id: users[0]?.user_id || 'demo-user',
    period: '2026-04',
    tokens_used: 128_450,
    tokens_limit: 1_000_000,
    cost_accumulated: 412.75,
    remaining_tokens: 871_550,
  };

  const accessRequests: AccessRequest[] = [
    {
      request_id: id('ar', 1),
      requester: users.find((u) => u.email.startsWith('dipak.mandlik'))?.email || users[2]?.email || 'dipak.mandlik@example.corp',
      resource_type: 'MODEL',
      resource_id: 'claude-3-5-sonnet-20241022',
      status: 'PENDING',
      requested_at: isoMinutesAgo(60 * 5),
      reviewed_at: null,
      reviewed_by: null,
      reason: 'Need advanced reasoning for a migration plan.',
      metadata: { ttl_days: 7 },
    },
    {
      request_id: id('ar', 2),
      requester: users.find((u) => u.email.startsWith('bharat.rao'))?.email || users[0]?.email || 'bharat.rao@example.corp',
      resource_type: 'SKILL',
      resource_id: 'query-optimizer',
      status: 'APPROVED',
      requested_at: isoMinutesAgo(60 * 26),
      reviewed_at: isoMinutesAgo(60 * 22),
      reviewed_by: 'SECURITY_ADMIN',
      reason: 'Required for warehouse performance tuning in production.',
      metadata: { ttl_days: 30 },
    },
    {
      request_id: id('ar', 3),
      requester: users.find((u) => u.email.startsWith('chetan.thorat'))?.email || users[1]?.email || 'chetan.thorat@example.corp',
      resource_type: 'MODEL',
      resource_id: 'gpt-4o',
      status: 'PENDING',
      requested_at: isoMinutesAgo(60 * 12),
      reviewed_at: null,
      reviewed_by: null,
      reason: 'Need better summarization quality for stakeholder reporting.',
      metadata: { ttl_days: 14 },
    },
    {
      request_id: id('ar', 4),
      requester: users.find((u) => u.email.startsWith('mayuri.gawande'))?.email || users[3]?.email || 'mayuri.gawande@example.corp',
      resource_type: 'SKILL',
      resource_id: 'data-quality-check',
      status: 'REJECTED',
      requested_at: isoMinutesAgo(60 * 48),
      reviewed_at: isoMinutesAgo(60 * 44),
      reviewed_by: 'SECURITY_ADMIN',
      reason: 'Please complete data-governance onboarding before requesting this skill.',
      metadata: { policy: 'training-required' },
    },
    {
      request_id: id('ar', 5),
      requester: users.find((u) => u.email.startsWith('omkar.wakchaure'))?.email || users[4]?.email || 'omkar.wakchaure@example.corp',
      resource_type: 'MODEL',
      resource_id: 'gemini-1.5-pro',
      status: 'PENDING',
      requested_at: isoMinutesAgo(60 * 3),
      reviewed_at: null,
      reviewed_by: null,
      reason: 'Evaluating long-context incident review prompts.',
      metadata: { ttl_days: 5 },
    },
    {
      request_id: id('ar', 6),
      requester: users.find((u) => u.email.startsWith('renuka.gavande'))?.email || users[5]?.email || 'renuka.gavande@example.corp',
      resource_type: 'SKILL',
      resource_id: 'schema-explorer',
      status: 'APPROVED',
      requested_at: isoMinutesAgo(60 * 72),
      reviewed_at: isoMinutesAgo(60 * 70),
      reviewed_by: 'ORG_ADMIN',
      reason: 'Needed for onboarding to curated data catalog.',
      metadata: { ttl_days: 60 },
    },
    {
      request_id: id('ar', 7),
      requester: users.find((u) => u.email.startsWith('rushikesh.joshi'))?.email || users[6]?.email || 'rushikesh.joshi@example.corp',
      resource_type: 'MODEL',
      resource_id: 'gpt-4o-mini',
      status: 'PENDING',
      requested_at: isoMinutesAgo(60 * 9),
      reviewed_at: null,
      reviewed_by: null,
      reason: 'Need model access for support triage assistant.',
      metadata: { ttl_days: 21 },
    },
  ];

  return { subscriptions, modelAccess, featureFlags, policies, tokenUsage, accessRequests };
}

const initialSkills = makeSkills();
const initialModels = makeModels();
const initialUsers = makeUsers(initialModels, initialSkills.registry);
const initialTeams = makeTeams();
const initialTeamAccess = makeTeamAccess(initialTeams, initialUsers, initialModels, initialSkills.registry);

const state: DemoState = {
  skills: initialSkills.assigned,
  skillRegistry: initialSkills.registry,
  models: initialModels,
  secretReferences: [
    { reference_key: 'OPENAI_API_KEY', provider: 'openai', is_active: true, created_at: isoMinutesAgo(60 * 24 * 15) },
    { reference_key: 'ANTHROPIC_API_KEY', provider: 'anthropic', is_active: true, created_at: isoMinutesAgo(60 * 24 * 14) },
  ],
  modelConfigs: [
    {
      id: id('cfg', 1),
      model_id: 'gpt-4o-mini',
      provider: 'openai',
      base_url: 'https://api.openai.com/v1',
      secret_reference_key: 'OPENAI_API_KEY',
      temperature: 0.2,
      max_tokens: 2048,
      request_timeout_seconds: 45,
      parameters: { top_p: 1 },
      is_active: true,
      created_at: isoMinutesAgo(60 * 24 * 14),
      updated_at: isoMinutesAgo(60 * 10),
    },
  ],
  users: initialUsers,
  teams: initialTeams,
  teamAccess: initialTeamAccess,
  settings: makeSettings(),
  monitoringLogs: makeAuditLogs(initialUsers, initialSkills.registry, initialModels),
  governance: makeGovernance(initialModels, initialUsers),
};

export const demoStore = {
  // Skills
  listSkills(): SkillItem[] {
    return [...state.skills];
  },
  listSkillRegistry(): SkillRegistryItem[] {
    return [...state.skillRegistry];
  },
  getSkillRegistry(skillId: string): SkillRegistryItem | null {
    return state.skillRegistry.find((s) => s.skill_id === skillId) || null;
  },
  setSkillEnabled(skillId: string, isEnabled: boolean): SkillRegistryItem | null {
    const item = state.skillRegistry.find((s) => s.skill_id === skillId);
    if (!item) return null;
    item.is_enabled = isEnabled;
    item.updated_at = isoMinutesAgo(0);

    const assigned = state.skills.find((s) => s.skill_id === skillId);
    if (assigned) assigned.is_active = isEnabled;
    return item;
  },
  deleteSkill(skillId: string): boolean {
    state.skillRegistry = state.skillRegistry.filter((s) => s.skill_id !== skillId);
    state.skills = state.skills.filter((s) => s.skill_id !== skillId);
    return true;
  },
  assignSkill(userId: string, skillId: string, expiresAt: string | null): { assigned_at: string; expires_at: string | null } {
    const when = isoMinutesAgo(0);
    const user = state.users.find((item) => item.user_id === userId);
    if (user && !user.allowed_skills.includes(skillId)) {
      user.allowed_skills = [...user.allowed_skills, skillId];
    }
    const skill = state.skills.find((s) => s.skill_id === skillId);
    if (skill) {
      skill.assignment = { assigned_at: when, expires_at: expiresAt, is_active: true };
      skill.is_active = true;
    }
    return { assigned_at: when, expires_at: expiresAt };
  },
  revokeSkill(userId: string, skillId: string): { revoked_at: string } {
    const when = isoMinutesAgo(0);
    const user = state.users.find((item) => item.user_id === userId);
    if (user) {
      user.allowed_skills = user.allowed_skills.filter((id) => id !== skillId);
    }
    const skill = state.skills.find((s) => s.skill_id === skillId);
    if (skill) {
      skill.assignment = null;
      skill.is_active = false;
    }
    return { revoked_at: when };
  },

  // Models
  listModels(): ModelItem[] {
    return [...state.models];
  },
  assignModel(userId: string, modelId: string, expiresAt: string | null): { assigned_at: string; expires_at: string | null } {
    const when = isoMinutesAgo(0);
    const user = state.users.find((item) => item.user_id === userId);
    if (user && !user.allowed_models.includes(modelId)) {
      user.allowed_models = [...user.allowed_models, modelId];
    }
    const model = state.models.find((item) => item.model_id === modelId);
    if (model) {
      model.is_available = true;
      model.access = { granted_at: when, expires_at: expiresAt, is_active: true };
    }
    return { assigned_at: when, expires_at: expiresAt };
  },
  revokeModel(userId: string, modelId: string): { revoked_at: string } {
    const when = isoMinutesAgo(0);
    const user = state.users.find((item) => item.user_id === userId);
    if (user) {
      user.allowed_models = user.allowed_models.filter((id) => id !== modelId);
    }
    return { revoked_at: when };
  },
  listSecretReferences(): SecretReferenceItem[] {
    return [...state.secretReferences];
  },
  createSecretReference(payload: { reference_key: string; provider: string }): SecretReferenceItem {
    const item: SecretReferenceItem = {
      reference_key: payload.reference_key,
      provider: payload.provider,
      is_active: true,
      created_at: isoMinutesAgo(0),
    };
    state.secretReferences.unshift(item);
    return item;
  },
  listModelConfigurations(): ModelConfigurationItem[] {
    return [...state.modelConfigs];
  },
  createModelConfiguration(payload: Omit<ModelConfigurationItem, 'id' | 'created_at' | 'updated_at' | 'is_active'>): ModelConfigurationItem {
    const cfg: ModelConfigurationItem = {
      ...payload,
      id: id('cfg', state.modelConfigs.length + 2),
      is_active: true,
      created_at: isoMinutesAgo(0),
      updated_at: isoMinutesAgo(0),
    };
    state.modelConfigs.unshift(cfg);
    return cfg;
  },
  updateModelConfiguration(configId: string, payload: Partial<ModelConfigurationItem>): ModelConfigurationItem | null {
    const cfg = state.modelConfigs.find((c) => c.id === configId);
    if (!cfg) return null;
    Object.assign(cfg, payload);
    cfg.updated_at = isoMinutesAgo(0);
    return cfg;
  },
  deleteModelConfiguration(configId: string): boolean {
    const before = state.modelConfigs.length;
    state.modelConfigs = state.modelConfigs.filter((c) => c.id !== configId);
    return state.modelConfigs.length !== before;
  },

  // Users
  listUsers(): UserItem[] {
    return [...state.users];
  },
  inviteUser(payload: { email: string; display_name?: string; role?: string }): UserInviteResponse {
    const createdAt = isoMinutesAgo(0);
    const user: UserItem = {
      user_id: id('user', state.users.length + 1),
      email: payload.email,
      display_name: payload.display_name || payload.email.split('@')[0],
      role: payload.role || 'user',
      is_active: true,
      last_login_at: null,
      allowed_models: state.models.map((m) => m.model_id).slice(0, 2),
      allowed_skills: state.skillRegistry.map((s) => s.skill_id).slice(0, 2),
    };
    state.users.unshift(user);
    return {
      user_id: user.user_id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      temp_password: `Tmp-${Math.floor(100000 + rand() * 900000)}`,
      created_at: createdAt,
    };
  },
  updateUserRole(userId: string, role: string): UserItem | null {
    const user = state.users.find((u) => u.user_id === userId);
    if (!user) return null;
    user.role = role;
    return user;
  },
  updateUserStatus(userId: string, isActive: boolean): UserItem | null {
    const user = state.users.find((u) => u.user_id === userId);
    if (!user) return null;
    user.is_active = isActive;
    return user;
  },
  getUserAccess(userId: string): { user_id: string; skill_ids: string[]; model_ids: string[]; team_ids: string[] } {
    const user = state.users.find((item) => item.user_id === userId);
    const teamIds = state.teams
      .filter((team) => (state.teamAccess[team.team_id]?.user_ids || []).includes(userId))
      .map((team) => team.team_id);
    return {
      user_id: userId,
      skill_ids: [...(user?.allowed_skills || [])],
      model_ids: [...(user?.allowed_models || [])],
      team_ids: teamIds,
    };
  },
  addUserAccess(userId: string, payload: { skill_ids?: string[]; model_ids?: string[]; team_ids?: string[] }) {
    const user = state.users.find((item) => item.user_id === userId);
    if (user) {
      const nextSkills = new Set([...(user.allowed_skills || []), ...((payload.skill_ids || []).filter(Boolean))]);
      const nextModels = new Set([...(user.allowed_models || []), ...((payload.model_ids || []).filter(Boolean))]);
      user.allowed_skills = [...nextSkills];
      user.allowed_models = [...nextModels];
    }

    for (const teamId of (payload.team_ids || []).filter(Boolean)) {
      const existing = state.teamAccess[teamId] || { user_ids: [], skill_ids: [], model_ids: [] };
      if (!existing.user_ids.includes(userId)) {
        existing.user_ids = [...existing.user_ids, userId];
      }
      state.teamAccess[teamId] = existing;
    }
    return this.getUserAccess(userId);
  },
  removeUserAccess(userId: string, payload: { skill_ids?: string[]; model_ids?: string[]; team_ids?: string[] }) {
    const user = state.users.find((item) => item.user_id === userId);
    if (user) {
      user.allowed_skills = user.allowed_skills.filter((id) => !(payload.skill_ids || []).includes(id));
      user.allowed_models = user.allowed_models.filter((id) => !(payload.model_ids || []).includes(id));
    }

    for (const teamId of (payload.team_ids || []).filter(Boolean)) {
      const existing = state.teamAccess[teamId];
      if (!existing) continue;
      existing.user_ids = existing.user_ids.filter((id) => id !== userId);
      state.teamAccess[teamId] = existing;
    }
    return this.getUserAccess(userId);
  },

  getSkillAccess(skillId: string): { skill_id: string; user_ids: string[]; team_ids: string[] } {
    const userIds = state.users
      .filter((user) => (user.allowed_skills || []).includes(skillId))
      .map((user) => user.user_id);
    const teamIds = Object.entries(state.teamAccess)
      .filter(([, value]) => (value.skill_ids || []).includes(skillId))
      .map(([teamId]) => teamId);
    return { skill_id: skillId, user_ids: userIds, team_ids: teamIds };
  },
  addSkillAccess(skillId: string, payload: { user_ids?: string[]; team_ids?: string[] }) {
    for (const userId of (payload.user_ids || []).filter(Boolean)) {
      const user = state.users.find((item) => item.user_id === userId);
      if (user && !user.allowed_skills.includes(skillId)) {
        user.allowed_skills = [...user.allowed_skills, skillId];
      }
    }
    for (const teamId of (payload.team_ids || []).filter(Boolean)) {
      const existing = state.teamAccess[teamId] || { user_ids: [], skill_ids: [], model_ids: [] };
      if (!existing.skill_ids.includes(skillId)) {
        existing.skill_ids = [...existing.skill_ids, skillId];
      }
      state.teamAccess[teamId] = existing;
    }
    return this.getSkillAccess(skillId);
  },
  removeSkillAccess(skillId: string, payload: { user_ids?: string[]; team_ids?: string[] }) {
    for (const userId of (payload.user_ids || []).filter(Boolean)) {
      const user = state.users.find((item) => item.user_id === userId);
      if (!user) continue;
      user.allowed_skills = user.allowed_skills.filter((id) => id !== skillId);
    }
    for (const teamId of (payload.team_ids || []).filter(Boolean)) {
      const existing = state.teamAccess[teamId];
      if (!existing) continue;
      existing.skill_ids = existing.skill_ids.filter((id) => id !== skillId);
      state.teamAccess[teamId] = existing;
    }
    return this.getSkillAccess(skillId);
  },

  // Teams
  listTeams(): TeamItem[] {
    return state.teams.map((team) => ({
      ...team,
      member_count: state.teamAccess[team.team_id]?.user_ids.length || 0,
    }));
  },
  createTeam(payload: { name: string; description?: string }): TeamItem {
    const team: TeamItem = {
      team_id: id('team', state.teams.length + 1),
      name: payload.name,
      description: payload.description || '',
      member_count: 0,
      created_at: isoMinutesAgo(0),
    };
    state.teams.unshift(team);
    state.teamAccess[team.team_id] = { user_ids: [], skill_ids: [], model_ids: [] };
    return team;
  },
  updateTeam(teamId: string, payload: { name?: string; description?: string }): TeamItem | null {
    const team = state.teams.find((t) => t.team_id === teamId);
    if (!team) return null;
    if (payload.name !== undefined) team.name = payload.name;
    if (payload.description !== undefined) team.description = payload.description;
    return team;
  },
  deleteTeam(teamId: string): boolean {
    const before = state.teams.length;
    state.teams = state.teams.filter((t) => t.team_id !== teamId);
    delete state.teamAccess[teamId];
    return state.teams.length !== before;
  },
  getTeamAccess(teamId: string): { team_id: string; user_ids: string[]; skill_ids: string[]; model_ids: string[] } {
    const current = state.teamAccess[teamId] || { user_ids: [], skill_ids: [], model_ids: [] };
    return {
      team_id: teamId,
      user_ids: [...current.user_ids],
      skill_ids: [...current.skill_ids],
      model_ids: [...current.model_ids],
    };
  },
  updateTeamAccess(teamId: string, payload: { user_ids: string[]; skill_ids: string[]; model_ids: string[] }) {
    state.teamAccess[teamId] = {
      user_ids: [...(payload.user_ids || [])],
      skill_ids: [...(payload.skill_ids || [])],
      model_ids: [...(payload.model_ids || [])],
    };
    return this.getTeamAccess(teamId);
  },

  // Settings
  getSettings(): OrgSettings {
    return { ...state.settings };
  },
  updateSettings(payload: Partial<OrgSettings>): OrgSettings {
    state.settings = { ...state.settings, ...payload };
    return { ...state.settings };
  },

  // Monitoring
  listAuditLogs(): AuditLogEntry[] {
    return [...state.monitoringLogs];
  },

  // Governance
  listSubscriptions(): Subscription[] {
    return [...state.governance.subscriptions];
  },
  createSubscription(payload: Subscription): Subscription {
    state.governance.subscriptions.unshift(payload);
    return payload;
  },
  listModelAccess(): ModelAccessControl[] {
    return [...state.governance.modelAccess];
  },
  setModelAccess(payload: ModelAccessControl): ModelAccessControl {
    const existing = state.governance.modelAccess.find((m) => m.model_id === payload.model_id);
    if (existing) Object.assign(existing, payload);
    else state.governance.modelAccess.unshift(payload);
    return payload;
  },
  listFeatureFlags(): FeatureFlag[] {
    return [...state.governance.featureFlags];
  },
  setFeatureFlag(payload: FeatureFlag): FeatureFlag {
    const idx = state.governance.featureFlags.findIndex((f) => f.feature_name === payload.feature_name && f.model_id === payload.model_id);
    if (idx >= 0) state.governance.featureFlags[idx] = payload;
    else state.governance.featureFlags.unshift(payload);
    return payload;
  },
  listPolicies(): Policy[] {
    return [...state.governance.policies];
  },
  createPolicy(payload: Omit<Policy, 'id' | 'created_at' | 'updated_at'>): Policy {
    const item: Policy = { ...payload, id: id('policy', state.governance.policies.length + 10), created_at: isoMinutesAgo(0), updated_at: isoMinutesAgo(0) };
    state.governance.policies.unshift(item);
    return item;
  },
  deletePolicy(policyName: string): boolean {
    const before = state.governance.policies.length;
    state.governance.policies = state.governance.policies.filter((p) => p.policy_name !== policyName);
    return state.governance.policies.length !== before;
  },
  getTokenUsage(): TokenUsage {
    return { ...state.governance.tokenUsage };
  },
  setTokenUsage(next: Partial<TokenUsage>): TokenUsage {
    state.governance.tokenUsage = { ...state.governance.tokenUsage, ...next };
    return { ...state.governance.tokenUsage };
  },
  listAccessRequests(status?: string): AccessRequest[] {
    const items = [...state.governance.accessRequests];
    if (!status) return items;
    return items.filter((r) => String(r.status).toLowerCase() === status.toLowerCase());
  },
  createAccessRequest(payload: { resource_type: string; resource_id: string; reason?: string; metadata?: Record<string, unknown> }): AccessRequest {
    const item: AccessRequest = {
      request_id: id('ar', state.governance.accessRequests.length + 2),
      requester: state.users[0]?.email || 'demo@example.corp',
      resource_type: String(payload.resource_type || '').toUpperCase(),
      resource_id: payload.resource_id,
      status: 'PENDING',
      requested_at: isoMinutesAgo(0),
      reviewed_at: null,
      reviewed_by: null,
      reason: payload.reason || null,
      metadata: payload.metadata,
    };
    state.governance.accessRequests.unshift(item);
    return item;
  },
  approveAccessRequest(requestId: string, expiresAt?: string): AccessRequest | null {
    const item = state.governance.accessRequests.find((r) => r.request_id === requestId);
    if (!item) return null;
    item.status = 'APPROVED';
    item.reviewed_at = isoMinutesAgo(0);
    item.reviewed_by = 'demo-admin';
    item.metadata = { ...(item.metadata || {}), expires_at: expiresAt || null };
    return item;
  },
  rejectAccessRequest(requestId: string, reason?: string): AccessRequest | null {
    const item = state.governance.accessRequests.find((r) => r.request_id === requestId);
    if (!item) return null;
    item.status = 'REJECTED';
    item.reviewed_at = isoMinutesAgo(0);
    item.reviewed_by = 'demo-admin';
    item.reason = reason || item.reason || 'Rejected by policy.';
    return item;
  },
  getUserDashboard(): UserDashboard {
    const sub = state.governance.subscriptions[0] || null;
    const usage = state.governance.tokenUsage || null;
    return {
      user_id: usage?.user_id || 'demo-user',
      subscription: sub,
      token_usage: usage,
      usage_stats: usage
        ? {
          user_id: usage.user_id,
          period: usage.period,
          model_breakdown: state.models.slice(0, 3).map((m, i) => ({
            model_id: m.model_id,
            total_tokens: Math.floor(usage.tokens_used * (0.55 - i * 0.15)),
            total_cost: Number((usage.cost_accumulated * (0.6 - i * 0.2)).toFixed(2)),
            request_count: 40 - i * 9,
          })),
        }
        : null,
    };
  },
};
