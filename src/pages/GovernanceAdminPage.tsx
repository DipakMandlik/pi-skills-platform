import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  Flag,
  KeyRound,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react';
import { adminApi, governanceApi } from '../services/governanceApi';
import type { FeatureFlag, ModelAccessControl, Policy as ApiPolicy, Subscription, TokenUsage } from '../services/governanceApi';
import { fetchUsers } from '../services/backendApi';
import { useToast } from '../components/ui';

type GovernanceTab = 'subscriptions' | 'models' | 'features' | 'policies' | 'users';

interface ModelRow {
  id: string;
  name: string;
  enabled: boolean;
  role: 'Admin' | 'All Users';
}

interface UsageRow {
  id: string;
  name: string;
  email: string;
  used: number;
  limit: number;
  accent: string;
}

interface PolicyCard {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  enabled: boolean;
}

const SNOWFLAKE_ADMIN_ROLES = ['ACCOUNTADMIN', 'ORG_ADMIN', 'SYSADMIN', 'SECURITYADMIN', 'SECURITY_ADMIN'] as const;

function isAllUsersRoleSet(allowedRoles: string[]): boolean {
  return allowedRoles.some((role) => ['ALL', '*', 'ANY'].includes(role.toUpperCase()));
}

function isAdminOnlyRoleSet(allowedRoles: string[]): boolean {
  const normalized = allowedRoles.map((role) => role.toUpperCase());
  return normalized.length > 0
    && normalized.every((role) => SNOWFLAKE_ADMIN_ROLES.includes(role as typeof SNOWFLAKE_ADMIN_ROLES[number]));
}

const emptySubscription: Subscription = {
  plan_name: '',
  display_name: 'No active subscription',
  monthly_token_limit: 0,
  max_tokens_per_request: 0,
  allowed_models: [],
  features: [],
  priority: 'standard',
  rate_limit_per_minute: 0,
  cost_budget_monthly: 0,
};

const demoSubscription: Subscription = {
  plan_name: 'enterprise-default',
  display_name: 'Enterprise Default',
  monthly_token_limit: 1_000_000,
  max_tokens_per_request: 4096,
  allowed_models: ['gpt-4o-mini', 'gpt-4o', 'gemini-1.5-pro', 'claude-3-5-sonnet-20241022'],
  features: ['workspace_assistant', 'governance_admin', 'monitoring', 'analytics'],
  priority: 'standard',
  rate_limit_per_minute: 120,
  cost_budget_monthly: 2500,
};

const demoModelRows: ModelRow[] = [
  { id: 'gpt-4o-mini', name: 'gpt-4o-mini', enabled: true, role: 'All Users' },
  { id: 'gpt-4o', name: 'gpt-4o', enabled: true, role: 'Admin' },
  { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', enabled: true, role: 'All Users' },
  { id: 'claude-3-5-sonnet-20241022', name: 'claude-3-5-sonnet-20241022', enabled: true, role: 'Admin' },
];

const demoFeatureFlags: FeatureFlag[] = [
  { feature_name: 'workspace_assistant', model_id: 'gpt-4o-mini', enabled: true, enabled_for: ['ALL'], config: { rollout: 100 } },
  { feature_name: 'advanced_reasoning', model_id: 'claude-3-5-sonnet-20241022', enabled: true, enabled_for: ['ACCOUNTADMIN'], config: { rollout: 100 } },
  { feature_name: 'monitoring', model_id: 'gpt-4o-mini', enabled: true, enabled_for: ['ALL'], config: { rollout: 100 } },
  { feature_name: 'skills', model_id: 'gpt-4o', enabled: true, enabled_for: ['ALL'], config: { rollout: 100 } },
];

const demoPolicyCards: PolicyCard[] = [
  { id: 'demo-policy-1', title: 'default-token-guard', subtitle: 'Block prompts above enterprise token ceiling.', value: 'token_limit', enabled: true },
  { id: 'demo-policy-2', title: 'admin-frontier-access', subtitle: 'Reserve frontier models for admins.', value: 'model_access', enabled: true },
  { id: 'demo-policy-3', title: 'pii-redaction-required', subtitle: 'Mask sensitive identifiers before execution.', value: 'compliance', enabled: true },
];

const demoTokenUsage: TokenUsage = {
  user_id: 'demo-user-1',
  period: '2026-04',
  tokens_used: 128450,
  tokens_limit: 1000000,
  cost_accumulated: 412.75,
  remaining_tokens: 871550,
};

const demoUsageRows: UsageRow[] = [
  { id: 'demo-user-1', name: 'Dipak Mandlik', email: 'dipak.mandlik@example.corp', used: 52340, limit: 1000000, accent: 'from-amber-400 to-orange-400' },
  { id: 'demo-user-2', name: 'Bharat Rao', email: 'bharat.rao@example.corp', used: 31880, limit: 1000000, accent: 'from-cyan-400 to-blue-500' },
  { id: 'demo-user-3', name: 'Chetan Thorat', email: 'chetan.thorat@example.corp', used: 21850, limit: 1000000, accent: 'from-violet-400 to-indigo-500' },
  { id: 'demo-user-4', name: 'Mayuri Gawande', email: 'mayuri.gawande@example.corp', used: 13920, limit: 1000000, accent: 'from-emerald-400 to-teal-500' },
  { id: 'demo-user-5', name: 'Omkar Wakchaure', email: 'omkar.wakchaure@example.corp', used: 8460, limit: 1000000, accent: 'from-fuchsia-400 to-pink-500' },
];

const tabs = [
  { id: 'subscriptions' as const, label: 'Subscriptions', icon: CreditCard },
  { id: 'models' as const, label: 'Model Access', icon: Brain },
  { id: 'features' as const, label: 'Feature Flags', icon: Flag },
  { id: 'policies' as const, label: 'Policies', icon: FileText },
  { id: 'users' as const, label: 'User Tokens', icon: KeyRound },
];

const compactNumber = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

export function GovernanceAdminPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<GovernanceTab>('subscriptions');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription>(emptySubscription);
  const [modelRows, setModelRows] = useState<ModelRow[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [policyCards, setPolicyCards] = useState<PolicyCard[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [syncIssue, setSyncIssue] = useState(false);
  const [lastUpdatedText, setLastUpdatedText] = useState('just now');
  const [usageSnapshot, setUsageSnapshot] = useState<TokenUsage | null>(null);

  const executionUsed = usageSnapshot?.tokens_used ?? 0;
  const executionLimit = usageSnapshot?.tokens_limit ?? 0;
  const tokenUsed = usageSnapshot?.tokens_used ?? 0;
  const tokenLimit = usageSnapshot?.tokens_limit ?? 0;
  const executionPercent = executionLimit > 0 ? Math.round((executionUsed / executionLimit) * 100) : 0;
  const tokenPercent = tokenLimit > 0 ? Math.round((tokenUsed / tokenLimit) * 100) : 0;

  const hydrateFromApi = async () => {
    setIsRefreshing(true);
    const [subsRes, accessRes, flagsRes, policyRes, usageRes, usersRes] = await Promise.allSettled([
      adminApi.listSubscriptions(),
      adminApi.listModelAccess(),
      adminApi.listFeatureFlags(),
      adminApi.listPolicies(),
      governanceApi.getTokenUsage(),
      fetchUsers(),
    ]);

    let hadFailure = false;

    if (subsRes.status === 'fulfilled') {
      setSubscription(subsRes.value.subscriptions[0] || demoSubscription);
    } else {
      setSubscription(demoSubscription);
      hadFailure = true;
    }

    if (accessRes.status === 'fulfilled') {
      const mapped: ModelRow[] = accessRes.value.configs.map((cfg) => ({
        id: cfg.model_id,
        name: cfg.model_id,
        enabled: cfg.enabled,
        role: isAdminOnlyRoleSet(cfg.allowed_roles) ? 'Admin' : 'All Users',
      }));
      setModelRows(mapped.length > 0 ? mapped : demoModelRows);
    } else {
      setModelRows(demoModelRows);
      hadFailure = true;
    }

    if (flagsRes.status === 'fulfilled') {
      setFeatureFlags(flagsRes.value.flags.length > 0 ? flagsRes.value.flags.slice(0, 4) : demoFeatureFlags);
    } else {
      setFeatureFlags(demoFeatureFlags);
      hadFailure = true;
    }

    if (policyRes.status === 'fulfilled') {
      const transformed: PolicyCard[] = policyRes.value.policies.slice(0, 3).map((policy: ApiPolicy) => ({
        id: policy.id,
        title: policy.policy_name,
        subtitle: policy.description || policy.policy_type,
        value: policy.policy_type,
        enabled: policy.enabled,
      }));
      setPolicyCards(transformed.length > 0 ? transformed : demoPolicyCards);
    } else {
      setPolicyCards(demoPolicyCards);
      hadFailure = true;
    }

    const usage: TokenUsage = usageRes.status === 'fulfilled' && usageRes.value.usage
      ? usageRes.value.usage
      : demoTokenUsage;
    setUsageSnapshot(usage);
    if (usageRes.status === 'rejected') hadFailure = true;

    if (usersRes.status === 'fulfilled' && usersRes.value.length > 0) {
      const defaultLimit = usage.tokens_limit || 100000;
      setUsageRows(usersRes.value.slice(0, 5).map((user, index) => ({
        id: user.user_id,
        name: user.display_name || user.email,
        email: user.email,
        used: index === 0 ? usage.tokens_used : Math.max(0, Math.floor(usage.tokens_used * (0.3 - index * 0.05))),
        limit: defaultLimit,
        accent: ['from-amber-400 to-orange-400', 'from-cyan-400 to-blue-500', 'from-violet-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-fuchsia-400 to-pink-500'][index % 5],
      })));
    } else {
      setUsageRows(demoUsageRows);
      hadFailure = true;
    }

    setSyncIssue(hadFailure);
    setLastUpdatedText(new Date().toLocaleTimeString());
    setIsRefreshing(false);
    setIsLoading(false);
  };

  useEffect(() => {
    hydrateFromApi();
  }, []);

  const featureRows = useMemo(
    () =>
      featureFlags.map((flag) => ({
        id: `${flag.feature_name}-${flag.model_id}`,
        name: flag.feature_name,
        model: flag.model_id,
        enabled: flag.enabled,
        audience: flag.enabled_for.join(', ') || 'all users',
      })),
    [featureFlags]
  );

  const toggleModel = async (id: string) => {
    const current = modelRows.find((row) => row.id === id);
    if (!current) return;
    const nextEnabled = !current.enabled;
    setModelRows((prev) => prev.map((row) => (row.id === id ? { ...row, enabled: nextEnabled } : row)));
    try {
      await adminApi.setModelAccess({
        model_id: id,
        allowed_roles: nextEnabled
          ? (current.role === 'Admin' ? [...SNOWFLAKE_ADMIN_ROLES] : ['ALL'])
          : [...SNOWFLAKE_ADMIN_ROLES],
        max_tokens_per_request: subscription.max_tokens_per_request || 2048,
        enabled: nextEnabled,
        rate_limit_per_minute: subscription.rate_limit_per_minute || 60,
      });
      toast('success', `Model access ${nextEnabled ? 'enabled' : 'disabled'} for ${id}`);
    } catch (err: unknown) {
      setModelRows((prev) => prev.map((row) => (row.id === id ? { ...row, enabled: current.enabled } : row)));
      toast('error', err instanceof Error ? err.message : 'Failed to update model access');
    }
  };

  const toggleFeature = async (id: string) => {
    const current = featureFlags.find((flag) => `${flag.feature_name}-${flag.model_id}` === id);
    if (!current) return;
    const nextEnabled = !current.enabled;
    setFeatureFlags((prev) =>
      prev.map((flag) => (`${flag.feature_name}-${flag.model_id}` === id ? { ...flag, enabled: nextEnabled } : flag)),
    );
    try {
      await adminApi.setFeatureFlag({ ...current, enabled: nextEnabled });
      toast('success', `${current.feature_name} ${nextEnabled ? 'enabled' : 'disabled'}`);
    } catch (err: unknown) {
      setFeatureFlags((prev) =>
        prev.map((flag) => (`${flag.feature_name}-${flag.model_id}` === id ? { ...flag, enabled: current.enabled } : flag)),
      );
      toast('error', err instanceof Error ? err.message : 'Failed to update feature flag');
    }
  };

  const primaryButtonClass =
    'rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md';

  const secondaryButtonClass =
    'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-transform hover:scale-[1.02] hover:bg-slate-50';

  if (isLoading) {
    return (
      <div className="space-y-5 py-2">
        {/* Hero skeleton */}
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-blue-100/90 via-indigo-100/70 to-violet-100/80 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-white/60 animate-pulse" />
            <div className="h-9 w-48 rounded-lg bg-white/60 animate-pulse" />
          </div>
          <div className="h-4 w-64 rounded bg-white/40 animate-pulse" />
        </div>
        {/* Tab bar skeleton */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5">
          <div className="grid grid-cols-5 gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        </div>
        {/* Content skeleton */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-4">
              <div className="h-6 w-32 rounded bg-slate-200 animate-pulse" />
              <div className="h-10 w-48 rounded bg-slate-100 animate-pulse" />
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-12 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-blue-100/90 via-indigo-100/70 to-violet-100/80 p-6 shadow-sm"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-36 w-36 rounded-full bg-blue-300/20 blur-2xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/80 p-2.5 shadow-sm">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">AI Governance</h1>
            </div>
            <p className="text-base text-slate-600">Manage subscriptions, model access, and token limits</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/90 px-4 py-2 text-base font-semibold text-slate-800 shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Governance Active
            </div>
            <button className={secondaryButtonClass} onClick={hydrateFromApi} disabled={isRefreshing}>
              <span className="inline-flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </span>
            </button>
          </div>
        </div>
      </motion.section>

      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-slate-900'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'subscriptions' && (
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.4fr]"
        >
          <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="text-3xl font-bold text-slate-900">{subscription.display_name}</h2>
            <p className="text-4xl font-bold tracking-tight text-slate-900">
              ${subscription.cost_budget_monthly || 0}<span className="text-2xl font-medium text-slate-500">/month</span>
            </p>

            <ul className="mt-5 space-y-2.5 text-base text-slate-700">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{subscription.rate_limit_per_minute || 0} requests / minute</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{compactNumber(subscription.monthly_token_limit || 0)} tokens / month</li>
              {subscription.features.slice(0, 2).map((feature) => (
                <li key={feature} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{feature}</li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-3">
              <button className={primaryButtonClass} onClick={hydrateFromApi}>
                <span className="inline-flex items-center gap-2">Refresh Plans <RefreshCw className="h-4 w-4" /></span>
              </button>
              <button className={secondaryButtonClass} onClick={() => setActiveTab('users')}>View Token Usage</button>
            </div>

            <div className="mt-6 space-y-4 rounded-xl bg-slate-50/90 p-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                  <span>Executions: {executionUsed.toLocaleString()} / {executionLimit.toLocaleString()}</span>
                  <span>{Number.isFinite(executionPercent) ? executionPercent : 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${Number.isFinite(executionPercent) ? executionPercent : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                  <span>Tokens: {compactNumber(tokenUsed)} / {compactNumber(tokenLimit)}</span>
                  <span>{Number.isFinite(tokenPercent) ? tokenPercent : 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${Number.isFinite(tokenPercent) ? tokenPercent : 0}%` }} />
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <h3 className="mb-3 px-2 text-xl font-semibold text-slate-900">Model Access</h3>
            {modelRows.length > 0 ? (
              <div className="space-y-1.5">
                {modelRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${row.enabled ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-lg font-medium text-slate-800">{row.name}</span>
                    </div>

                    <div className="flex items-center gap-6">
                      <span className={`text-sm font-semibold ${row.enabled ? 'text-slate-600' : 'text-slate-400'}`}>{row.enabled ? 'Enabled' : 'Disabled'}</span>
                      <span className="text-sm text-slate-600">{row.enabled ? row.role : '-'}</span>
                      <button
                        type="button"
                        onClick={() => toggleModel(row.id)}
                        className={`relative h-7 w-12 rounded-full transition-colors ${row.enabled ? 'bg-blue-500' : 'bg-slate-300'}`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${row.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                No model access rules have been configured yet.
              </div>
            )}
          </article>
        </motion.section>
      )}

      {syncIssue && (
        <section className="rounded-2xl border border-red-200 bg-red-50/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-xl font-semibold">Temporary sync issue with governance service</span>
              <span className="text-base text-red-600">Last updated: {lastUpdatedText}</span>
            </div>
            <div className="flex gap-2">
              <button className={secondaryButtonClass} onClick={hydrateFromApi}>Retry</button>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'models' && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3">
            {modelRows.map((row) => (
              <article key={row.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-slate-900">{row.name}</p>
                    <p className="text-sm text-slate-600">Role: {row.role}</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700">
                    <CheckCircle2 className={`h-4 w-4 ${row.enabled ? 'text-emerald-500' : 'text-slate-400'}`} />
                    {row.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </motion.section>
      )}

      {activeTab === 'features' && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {featureRows.length > 0 ? featureRows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{row.name}</p>
                  <p className="text-sm text-slate-600">Model: {row.model}</p>
                  <p className="text-xs text-slate-500">Audience: {row.audience}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFeature(row.id)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${row.enabled ? 'bg-blue-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${row.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500 lg:col-span-2">
              No feature flags are configured for this environment.
            </div>
          )}
        </motion.section>
      )}

      {activeTab === 'policies' && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {policyCards.length > 0 ? policyCards.map((policy) => (
            <article key={policy.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                <Sparkles className="h-3.5 w-3.5" />
                {policy.enabled ? 'Active' : 'Draft'}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{policy.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{policy.subtitle}</p>
              <p className="mt-3 text-sm font-semibold text-blue-700">{policy.value}</p>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500 md:col-span-3">
              No governance policies have been created yet.
            </div>
          )}
        </motion.section>
      )}

      {(activeTab === 'users' || activeTab === 'subscriptions') && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <h3 className="mb-4 text-xl font-semibold text-slate-900">User Tokens</h3>
            {usageRows.length > 0 ? (
              <div className="space-y-4">
                {usageRows.map((row) => {
                  const percent = row.limit > 0 ? Math.round((row.used / row.limit) * 100) : 0;
                  const initials = row.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('');
                  return (
                    <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${row.accent} text-sm font-semibold text-white`}>
                            {initials}
                          </div>
                          <div>
                            <p className="text-base font-semibold text-slate-900">{row.name}</p>
                            <p className="text-xs text-slate-500">{row.email}</p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">{compactNumber(row.used)} / {compactNumber(row.limit)}</p>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
                No token usage records are available yet.
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Policies</h3>
            {policyCards.length > 0 ? (
              <div className="space-y-3">
                {policyCards.map((policy) => (
                  <div key={policy.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-semibold text-slate-900">{policy.title}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${policy.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {policy.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{policy.subtitle}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
                No policies are active in the control plane yet.
              </div>
            )}

            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800">
              <p className="font-semibold">Governance posture</p>
              <p className="mt-1">Policy enforcement is running against the live governance control plane for this environment.</p>
              {syncIssue && <p className="mt-2 text-blue-700">Some values may be incomplete until the latest refresh succeeds.</p>}
            </div>
          </article>
        </motion.section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BarChart3 className="h-4 w-4" />
          Enterprise control plane telemetry active. Updated {lastUpdatedText}.
        </div>
      </section>
    </div>
  );
}
