import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, Users, Zap, Brain, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardHeader, Badge, Skeleton, EmptyState } from '../components/ui';
import { cn } from '../lib/cn';
import { fetchMonitoring, fetchSkillRegistry, fetchUsers, type AuditLogEntry, type SkillRegistryItem, type UserItem } from '../services/backendApi';
import { adminApi } from '../services/governanceApi';
import { Button } from '../components/ui';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATEGORY_COLORS: Record<string, string> = {
  sql: '#2563eb', performance: '#2563eb', query: '#2563eb',
  analytics: '#10b981', reporting: '#10b981',
  ml: '#8b5cf6', ai: '#8b5cf6', cortex: '#8b5cf6',
  discovery: '#0ea5e9', metadata: '#0ea5e9',
  security: '#f59e0b', governance: '#f59e0b',
  general: '#94a3b8',
};

function buildFallbackLogs(): AuditLogEntry[] {
  const skills = ['query-optimizer', 'schema-explorer', 'data-quality-check'];
  const models = ['gpt-4o-mini', 'claude-3-haiku-20240307', 'gemini-1.5-pro'];
  const users = ['user_asha', 'user_dipak', 'user_bharat', 'user_chetan', 'user_mayuri'];
  return Array.from({ length: 56 }, (_, i) => ({
    id: `an_fallback_${i + 1}`,
    request_id: `an_req_${9000 + i}`,
    user_id: users[i % users.length],
    skill_id: skills[i % skills.length],
    model_id: models[i % models.length],
    action: i % 5 === 0 ? 'policy_check' : 'execute',
    outcome: i % 13 === 0 ? 'denied' : 'allowed',
    tokens_used: 700 + (i * 90) % 2400,
    latency_ms: 140 + (i * 37) % 920,
    timestamp: new Date(Date.now() - i * 2 * 60 * 60 * 1000).toISOString(),
  }));
}

function buildFallbackSkills(): SkillRegistryItem[] {
  return [
    { skill_id: 'query-optimizer', display_name: 'Query Optimizer', description: 'Optimize SQL.', required_models: ['gpt-4o-mini'], is_enabled: true, version: '1.0.0', input_schema: {}, output_format: {}, execution_handler: 'execute', error_handling: {}, domain: 'analytics', skill_type: 'assistant' },
    { skill_id: 'schema-explorer', display_name: 'Schema Explorer', description: 'Explore schema.', required_models: ['claude-3-haiku-20240307'], is_enabled: true, version: '1.0.0', input_schema: {}, output_format: {}, execution_handler: 'execute', error_handling: {}, domain: 'discovery', skill_type: 'assistant' },
    { skill_id: 'data-quality-check', display_name: 'Data Quality Check', description: 'DQ checks.', required_models: ['gemini-1.5-pro'], is_enabled: true, version: '1.0.0', input_schema: {}, output_format: {}, execution_handler: 'execute', error_handling: {}, domain: 'governance', skill_type: 'assistant' },
  ];
}

function buildFallbackUsers(): UserItem[] {
  return [
    { user_id: 'user_asha', email: 'asha.nair@example.corp', display_name: 'Asha Nair', role: 'user', is_active: true, last_login_at: new Date().toISOString(), allowed_models: ['gpt-4o-mini'], allowed_skills: ['query-optimizer'] },
    { user_id: 'user_dipak', email: 'dipak.mandlik@example.corp', display_name: 'Dipak Mandlik', role: 'admin', is_active: true, last_login_at: new Date().toISOString(), allowed_models: ['gpt-4o-mini', 'gemini-1.5-pro'], allowed_skills: ['query-optimizer', 'schema-explorer'] },
    { user_id: 'user_bharat', email: 'bharat.rao@example.corp', display_name: 'Bharat Rao', role: 'user', is_active: true, last_login_at: new Date().toISOString(), allowed_models: ['claude-3-haiku-20240307'], allowed_skills: ['schema-explorer'] },
    { user_id: 'user_chetan', email: 'chetan.thorat@example.corp', display_name: 'Chetan Thorat', role: 'user', is_active: true, last_login_at: new Date().toISOString(), allowed_models: ['gpt-4o-mini'], allowed_skills: ['data-quality-check'] },
  ];
}

function getCategoryColor(domain: string): string {
  const key = domain.toLowerCase();
  return CATEGORY_COLORS[key] || Object.entries(CATEGORY_COLORS).find(([k]) => key.includes(k))?.[1] || '#94a3b8';
}

export function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [skills, setSkills] = useState<SkillRegistryItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [globalStats, setGlobalStats] = useState<{
    total_tokens: number; total_cost: number; total_requests: number; unique_users: number;
  } | null>(null);
  const [monitoringSummary, setMonitoringSummary] = useState<{
    total_executions: number; total_denials: number; total_tokens: number; avg_latency_ms: number;
  } | null>(null);

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    setError(null);
    setPartialErrors([]);
    Promise.allSettled([
      fetchMonitoring({ page: 1, page_size: 500 }),
      fetchSkillRegistry(),
      fetchUsers(),
      adminApi.getGlobalStats('7d'),
    ]).then(([monRes, skillsRes, usersRes, statsRes]) => {
      const failures: string[] = [];
      if (monRes.status === 'fulfilled') {
        const fallbackLogs = buildFallbackLogs();
        const useLogs = monRes.value.logs.length > 0 ? monRes.value.logs : fallbackLogs;
        setLogs(useLogs);
        if (monRes.value.logs.length > 0) {
          setMonitoringSummary(monRes.value.summary);
        } else {
          const totalTokens = useLogs.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
          const denials = useLogs.filter((log) => log.outcome?.toLowerCase() === 'denied').length;
          const latencies = useLogs.map((log) => log.latency_ms || 0);
          setMonitoringSummary({
            total_executions: useLogs.length,
            total_denials: denials,
            total_tokens: totalTokens,
            avg_latency_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
          });
          failures.push('Monitoring (live)');
        }
      } else {
        const fallbackLogs = buildFallbackLogs();
        const totalTokens = fallbackLogs.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
        const denials = fallbackLogs.filter((log) => log.outcome?.toLowerCase() === 'denied').length;
        const latencies = fallbackLogs.map((log) => log.latency_ms || 0);
        setLogs(fallbackLogs);
        setMonitoringSummary({
          total_executions: fallbackLogs.length,
          total_denials: denials,
          total_tokens: totalTokens,
          avg_latency_ms: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        });
        failures.push('Monitoring (live)');
      }
      if (skillsRes.status === 'fulfilled') {
        if (skillsRes.value.length > 0) {
          setSkills(skillsRes.value);
        } else {
          setSkills(buildFallbackSkills());
          failures.push('Skills (live)');
        }
      } else {
        setSkills(buildFallbackSkills());
        failures.push('Skills (live)');
      }
      if (usersRes.status === 'fulfilled') {
        if (usersRes.value.length > 0) {
          setUsers(usersRes.value);
        } else {
          setUsers(buildFallbackUsers());
          failures.push('Users (live)');
        }
      } else {
        setUsers(buildFallbackUsers());
        failures.push('Users (live)');
      }
      if (statsRes.status === 'fulfilled') {
        setGlobalStats(statsRes.value);
      } else {
        setGlobalStats({
          total_tokens: 142300,
          total_cost: 438.42,
          total_requests: 560,
          unique_users: 12,
        });
        failures.push('Governance (live)');
      }
      setPartialErrors(failures);
      setError(null);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // ── Derived Data ───────────────────────────────────────────────────────────

  const usageData = useMemo(() => {
    const buckets = DAY_NAMES.map((name) => ({ name, uses: 0, errors: 0 }));
    logs.forEach((log) => {
      const dayIdx = new Date(log.timestamp).getDay();
      if (log.outcome?.toLowerCase().includes('error') || log.outcome?.toLowerCase() === 'denied') {
        buckets[dayIdx].errors += 1;
      } else {
        buckets[dayIdx].uses += 1;
      }
    });
    // Rotate so week starts from Mon
    const today = new Date().getDay();
    const rotated: typeof buckets = [];
    for (let i = 6; i >= 0; i--) {
      rotated.push(buckets[(today - i + 7) % 7]);
    }
    return rotated;
  }, [logs]);

  const skillRanking = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      if (log.skill_id) counts[log.skill_id] = (counts[log.skill_id] || 0) + 1;
    });
    const skillMap: Record<string, string> = {};
    skills.forEach((s) => { skillMap[s.skill_id] = s.display_name; });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([id, count], i) => ({
        name: skillMap[id] || id,
        uses: count,
        color: Object.values(CATEGORY_COLORS)[i % Object.values(CATEGORY_COLORS).length],
      }));
  }, [logs, skills]);

  const userActivity = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      if (log.user_id) counts[log.user_id] = (counts[log.user_id] || 0) + 1;
    });
    const userMap: Record<string, string> = {};
    users.forEach((u) => { userMap[u.user_id] = u.display_name || u.email; });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, queries]) => ({
        name: userMap[id] || `User ${id.slice(0, 6)}`,
        queries,
        skills: users.find((u) => u.user_id === id)?.allowed_skills.length ?? 0,
      }));
  }, [logs, users]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    skills.forEach((s) => {
      const domain = (s.domain || s.skill_type || 'general').toLowerCase();
      counts[domain] = (counts[domain] || 0) + 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Math.round((count / total) * 100),
      color: getCategoryColor(name),
    }));
  }, [skills]);

  const errorRateData = useMemo(() => {
    const totals: Record<string, { success: number; error: number }> = {};
    const skillMap: Record<string, string> = {};
    skills.forEach((s) => { skillMap[s.skill_id] = s.display_name; });
    logs.forEach((log) => {
      if (!log.skill_id) return;
      if (!totals[log.skill_id]) totals[log.skill_id] = { success: 0, error: 0 };
      if (log.outcome?.toLowerCase().includes('error') || log.outcome?.toLowerCase() === 'denied') {
        totals[log.skill_id].error += 1;
      } else {
        totals[log.skill_id].success += 1;
      }
    });
    return Object.entries(totals)
      .map(([id, { success, error }]) => {
        const rate = ((error / (success + error)) * 100);
        return { name: skillMap[id] || id, rate: parseFloat(rate.toFixed(1)), color: rate > 5 ? '#ef4444' : rate > 2 ? '#f97316' : '#10b981' };
      })
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }, [logs, skills]);

  // ── Summary Stats ──────────────────────────────────────────────────────────

  const totalUses = usageData.reduce((a, d) => a + d.uses, 0);
  const totalErrors = usageData.reduce((a, d) => a + d.errors, 0);
  const avgDaily = Math.round(totalUses / 7);
  const errorRate = totalUses > 0 ? ((totalErrors / totalUses) * 100).toFixed(1) : '0.0';
  const activeSkills = skills.filter((s) => s.is_enabled).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={180} height={28} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={100} className="rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton variant="rectangular" height={300} className="rounded-xl" />
          <Skeleton variant="rectangular" height={300} className="rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex items-center gap-2 text-error">
          <AlertTriangle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
        <Button variant="secondary" onClick={loadAnalytics}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted mt-1">Insights into skill usage and performance</p>
      </div>

      {partialErrors.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div>
                <p className="text-sm font-medium text-foreground">Some analytics sources are unavailable</p>
                <p className="text-xs text-muted mt-1">Incomplete widgets: {partialErrors.join(', ')}.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={loadAnalytics}>Retry</Button>
          </div>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Executions (7d)',
            value: (monitoringSummary?.total_executions ?? totalUses).toLocaleString(),
            change: `${(globalStats?.unique_users ?? 0)} unique users`,
            trend: 'up' as const,
            icon: <Zap className="w-5 h-5" />,
            color: 'text-primary',
          },
          {
            label: 'Avg Daily Uses',
            value: avgDaily,
            change: 'Past 7 days',
            trend: 'up' as const,
            icon: <TrendingUp className="w-5 h-5" />,
            color: 'text-success',
          },
          {
            label: 'Error Rate',
            value: `${errorRate}%`,
            change: `${totalErrors} errors`,
            trend: totalErrors > 0 ? 'down' as const : 'up' as const,
            icon: <AlertTriangle className="w-5 h-5" />,
            color: 'text-warning',
          },
          {
            label: 'Active Skills',
            value: `${activeSkills}/${skills.length}`,
            change: skills.length > 0 ? `${Math.round((activeSkills / skills.length) * 100)}% utilization` : 'No skills',
            trend: 'up' as const,
            icon: <Brain className="w-5 h-5" />,
            color: 'text-accent',
          },
        ].map((stat) => (
          <Card key={stat.label} padding="sm" hover>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                <div className="flex items-center gap-1 mt-1">
                  {stat.trend === 'up' ? <ArrowUpRight className="w-3 h-3 text-success" /> : <ArrowDownRight className="w-3 h-3 text-error" />}
                  <span className="text-xs text-muted">{stat.change}</span>
                </div>
              </div>
              <div className={cn('p-2 rounded-lg bg-surface', stat.color)}>{stat.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Trend */}
        <Card>
          <CardHeader title="Usage Trend" subtitle="Daily skill usage over the past week" />
          {usageData.some((d) => d.uses > 0 || d.errors > 0) ? (
            <div className="h-[250px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-surface-elevated border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
                          <p className="font-semibold text-foreground">{payload[0].payload.name}</p>
                          <p className="text-muted">Uses: <span className="font-mono text-foreground">{payload[0].payload.uses}</span></p>
                          <p className="text-muted">Errors: <span className="font-mono text-error">{payload[0].payload.errors}</span></p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="uses" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<BarChart3 className="w-6 h-6" />} title="No usage data" description="Execute skills to see usage trends." />
          )}
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader title="Category Distribution" subtitle="Skills by category" />
          {categoryData.length > 0 ? (
            <>
              <div className="h-[220px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                      {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-surface-elevated border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
                            <p className="font-semibold text-foreground">{payload[0].name}</p>
                            <p className="text-muted">{payload[0].value}% of skills</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                    <span className="text-xs text-muted">{cat.name} ({cat.value}%)</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={<Brain className="w-6 h-6" />} title="No skills" description="Add skills to see category distribution." />
          )}
        </Card>

        {/* Skill Ranking */}
        <Card>
          <CardHeader title="Skill Ranking" subtitle="Most used skills this period" />
          {skillRanking.length > 0 ? (
            <div className="space-y-3 mt-2">
              {skillRanking.map((skill, i) => (
                <div key={skill.name} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted w-5">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground truncate">{skill.name}</span>
                    </div>
                    <div className="h-2 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(skill.uses / skillRanking[0].uses) * 100}%`, background: skill.color }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-muted w-12 text-right">{skill.uses.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Zap className="w-6 h-6" />} title="No execution data" description="Skills haven't been executed yet." />
          )}
        </Card>

        {/* Error Rate */}
        <Card>
          <CardHeader title="Error Rate by Skill" subtitle="Percentage of failed executions" />
          {errorRateData.length > 0 ? (
            <div className="space-y-3 mt-2">
              {errorRateData.map((skill) => (
                <div key={skill.name} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground truncate">{skill.name}</span>
                      <span className="text-xs font-mono" style={{ color: skill.color }}>{skill.rate}%</span>
                    </div>
                    <div className="h-2 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(skill.rate * 10, 100)}%`, background: skill.color }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<AlertTriangle className="w-6 h-6" />} title="No error data" description="No skill errors recorded yet." />
          )}
        </Card>
      </div>

      {/* Most Active Users */}
      <Card>
        <CardHeader title="Most Active Users" subtitle="Top users by execution volume" />
        {userActivity.length > 0 ? (
          <div className="divide-y divide-border mt-2">
            {userActivity.map((user, i) => (
              <motion.div
                key={user.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted w-5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted">{user.queries} executions · {user.skills} skills</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-muted">{user.queries} runs</span>
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="w-6 h-6" />} title="No user activity" description="No skill executions recorded yet." />
        )}
      </Card>
    </div>
  );
}
