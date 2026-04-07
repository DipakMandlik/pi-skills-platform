import React from 'react';
import { motion } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Puzzle, Brain, Activity, Clock, Sparkles, Database, ArrowUpRight, CheckCircle2, Timer, Zap } from 'lucide-react';
import { MetricCard, Card, StatusBadge } from '../common';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';

const MOCK_ASSIGNED_SKILLS = [
  { name: 'SQL Writer', status: 'active' as const, expiresAt: '2026-04-15', uses: 47, description: 'Generate optimized SQL queries' },
  { name: 'Data Explorer', status: 'active' as const, expiresAt: '2026-04-15', uses: 23, description: 'Discover schemas and tables' },
  { name: 'Query Optimizer', status: 'active' as const, expiresAt: '2026-03-30', uses: 12, description: 'Improve SQL performance' },
];

const MOCK_ACCESSIBLE_MODELS = [
  { name: 'Gemini 2.0 Flash', provider: 'Google', tier: 'Free', status: 'active' as const },
  { name: 'GPT-4o-mini', provider: 'OpenAI', tier: 'Standard', status: 'active' as const },
];

const MOCK_RECENT_QUERIES = [
  { query: 'SELECT * FROM BANKING.BRONZE.ACCOUNT LIMIT 10', time: '5 min ago', rows: 10, duration: '120ms' },
  { query: 'SELECT customer_id, SUM(revenue) FROM BANKING.GOLD.REVENUE GROUP BY 1', time: '1 hour ago', rows: 247, duration: '340ms' },
  { query: 'SHOW TABLES IN BANKING.SILVER', time: '3 hours ago', rows: 12, duration: '85ms' },
];

const PERSONAL_TREND = [
  { day: 'Mon', queries: 3 },
  { day: 'Tue', queries: 5 },
  { day: 'Wed', queries: 2 },
  { day: 'Thu', queries: 8 },
  { day: 'Fri', queries: 5 },
  { day: 'Sat', queries: 0 },
  { day: 'Sun', queries: 0 },
];

const SPARKLINE_QUERIES = [3, 5, 2, 8, 5, 0, 0];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-[var(--color-text-main)]">{label}</p>
      <p className="text-[var(--color-text-muted)]">{payload[0].value} queries</p>
    </div>
  );
};

export function UserDashboard() {
  const navigate = useNavigate();

  const daysUntilExpiry = (date: string) => {
    const diff = new Date(date).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-xl font-bold text-[var(--color-text-main)]">My Dashboard</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Your assigned skills, accessible models, and recent activity
        </p>
      </motion.div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Assigned Skills"
          value={MOCK_ASSIGNED_SKILLS.length}
          subtitle="All active and ready"
          icon={<Puzzle className="w-4 h-4" />}
          color="blue"
          delay={0}
        />
        <MetricCard
          label="Available Models"
          value={MOCK_ACCESSIBLE_MODELS.length}
          subtitle="Gemini + OpenAI"
          icon={<Brain className="w-4 h-4" />}
          color="purple"
          delay={1}
        />
        <MetricCard
          label="Queries This Week"
          value="23"
          subtitle="Across all skills"
          icon={<Activity className="w-4 h-4" />}
          color="emerald"
          trend="up"
          trendValue="+5"
          sparkline={SPARKLINE_QUERIES}
          delay={2}
        />
      </div>

      {/* Skills + Models */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Skills */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-accent)]" />
              <h3 className="text-sm font-semibold text-[var(--color-text-main)]">My Skills</h3>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface)] px-1.5 py-0.5 rounded">
              {MOCK_ASSIGNED_SKILLS.length} assigned
            </span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {MOCK_ASSIGNED_SKILLS.map((skill, i) => {
              const daysLeft = daysUntilExpiry(skill.expiresAt);
              const urgency = daysLeft < 7 ? 'text-red-500' : daysLeft < 30 ? 'text-amber-500' : 'text-[var(--color-text-muted)]';
              return (
                <motion.div
                  key={skill.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-surface)]/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center shrink-0">
                    <Puzzle className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-text-main)]">{skill.name}</span>
                      <StatusBadge status={skill.status} />
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{skill.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-[var(--color-text-light)] flex items-center gap-1">
                        <Zap className="w-3 h-3" /> {skill.uses} uses
                      </span>
                      <span className={`text-[10px] flex items-center gap-1 ${urgency}`}>
                        <Timer className="w-3 h-3" /> {daysLeft} days left
                      </span>
                    </div>
                  </div>
                  {/* Usage bar */}
                  <div className="w-16 shrink-0">
                    <div className="h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (skill.uses / 50) * 100)}%` }}
                        transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500"
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>

        {/* Models + Activity Chart */}
        <div className="space-y-4">
          {/* Available Models */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Available Models</h3>
              </div>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {MOCK_ACCESSIBLE_MODELS.map((model, i) => (
                <motion.div
                  key={model.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--color-surface)]/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-[var(--color-text-main)]">{model.name}</span>
                      <p className="text-[11px] text-[var(--color-text-muted)]">{model.provider} · {model.tier}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Ready</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>

          {/* Weekly Activity Chart */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Weekly Activity</h3>
              </div>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={PERSONAL_TREND} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="personalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="queries"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#personalGrad)"
                    dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                    isAnimationActive={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Queries */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--color-accent)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Recent Queries</h3>
          </div>
          <button
            onClick={() => navigate(ROUTES.WORKSPACE)}
            className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium flex items-center gap-1 transition-colors"
          >
            Open workspace
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {MOCK_RECENT_QUERIES.map((query, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface)]/50 transition-colors group/row"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--color-surface)] flex items-center justify-center shrink-0">
                <Database className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-[var(--color-text-main)] truncate">{query.query}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-[11px] text-[var(--color-text-muted)]">
                <span className="tabular-nums">{query.rows} rows</span>
                <span className="font-mono tabular-nums text-[var(--color-text-light)]">{query.duration}</span>
                <span className="text-[var(--color-text-light)]">{query.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.35 }}
      >
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.2) 0%, transparent 50%)',
          }} />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold mb-1">Ready to query?</h3>
              <p className="text-sm text-blue-100 max-w-md">
                Open the workspace to chat with your AI skills and run SQL queries against Snowflake.
              </p>
            </div>
            <button
              onClick={() => navigate(ROUTES.WORKSPACE)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 text-sm font-semibold rounded-xl hover:bg-blue-50 transition-colors shadow-lg shadow-black/10 shrink-0"
            >
              Open Workspace
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
