import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import {
  Users, Puzzle, Brain, Activity, TrendingUp, Clock, Database, Zap,
  ArrowUpRight, BarChart3, PieChartIcon, Layers, AlertCircle, RefreshCw
} from 'lucide-react';
import { MetricCard, Card, StatusBadge, Tabs, Skeleton, MetricCardSkeleton } from '../common';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { fetchDashboardData, fetchQueryHistory, type DashboardData, type QueryHistoryEntry } from '../../api/snowflakeService';
import { mcpClient } from '../../api/mcpClient';

const DASHBOARD_CACHE_KEY = 'admin-dashboard-cache-v1';
const QUERY_HISTORY_CACHE_KEY = 'admin-dashboard-query-history-cache-v1';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-[var(--color-text-main)] mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--color-text-muted)]">{entry.name}:</span>
          <span className="font-mono font-medium text-[var(--color-text-main)]">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const [chartTab, setChartTab] = useState('queries');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'ok' | 'degraded' | 'error'>('degraded');

  const loadData = async () => {
    setError(null);
    const isColdStart = !dashboardData && queryHistory.length === 0;
    if (isColdStart) setLoading(true);
    else setRefreshing(true);

    try {
      // Fire a short health check, but never block dashboard data on it.
      mcpClient
        .getHealth({ timeoutMs: 2500 })
        .then((health) => setBackendStatus(health.snowflake_connector_ready ? 'ok' : 'degraded'))
        .catch(() => setBackendStatus('error'));

      const [dataRes, historyRes] = await Promise.allSettled([
        fetchDashboardData({ timeoutMs: 15000 }),
        fetchQueryHistory(10, { timeoutMs: 15000 }),
      ]);

      if (dataRes.status === 'fulfilled') {
        setDashboardData(dataRes.value);
        try {
          window.localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(dataRes.value));
        } catch {
          // ignore
        }
      }

      if (historyRes.status === 'fulfilled') {
        setQueryHistory(historyRes.value);
        try {
          window.localStorage.setItem(QUERY_HISTORY_CACHE_KEY, JSON.stringify(historyRes.value));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      if (isColdStart) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    try {
      const cachedDash = window.localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (cachedDash) {
        setDashboardData(JSON.parse(cachedDash) as DashboardData);
        setLoading(false);
      }
      const cachedHist = window.localStorage.getItem(QUERY_HISTORY_CACHE_KEY);
      if (cachedHist) {
        setQueryHistory(JSON.parse(cachedHist) as QueryHistoryEntry[]);
      }
    } catch {
      // ignore
    }
    loadData();
  }, []);

  // Build chart data from query history
  const queryTrend = queryHistory.length > 0
    ? queryHistory.slice(0, 7).reverse().map((q, i) => ({
        day: `Q${i + 1}`,
        queries: q.rows_produced || 1,
        errors: q.status === 'ERROR' ? 1 : 0,
        elapsed: q.total_elapsed_time,
      }))
    : [
        { day: 'Mon', queries: 0, errors: 0, elapsed: 0 },
        { day: 'Tue', queries: 0, errors: 0, elapsed: 0 },
        { day: 'Wed', queries: 0, errors: 0, elapsed: 0 },
        { day: 'Thu', queries: 0, errors: 0, elapsed: 0 },
        { day: 'Fri', queries: 0, errors: 0, elapsed: 0 },
        { day: 'Sat', queries: 0, errors: 0, elapsed: 0 },
        { day: 'Sun', queries: 0, errors: 0, elapsed: 0 },
      ];

  // Build warehouse distribution
  const warehouseDistribution = dashboardData?.warehouses.map((w) => ({
    name: w.name,
    value: w.running || 1,
    color: w.state === 'RUNNING' ? '#10b981' : w.state === 'SUSPENDED' ? '#f59e0b' : '#9ca3af',
  })) || [];

  const recentActivity = queryHistory.slice(0, 6).map((q) => ({
    id: q.id,
    user: q.user_name || 'System',
    action: 'Executed query',
    target: q.query_text.length > 60 ? q.query_text.substring(0, 60) + '...' : q.query_text,
    time: q.start_time ? new Date(q.start_time).toLocaleTimeString() : '—',
    type: q.status === 'ERROR' ? 'error' : 'query',
    status: q.status === 'ERROR' ? 'error' : q.status === 'RUNNING' ? 'warning' : 'success',
  }));

  const actionColors: Record<string, string> = {
    query: 'bg-blue-100 text-blue-600',
    error: 'bg-red-100 text-red-600',
    create: 'bg-emerald-100 text-emerald-600',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between"
      >
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">System Overview</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Live data from your Snowflake environment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-border-strong)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full ${
            backendStatus === 'ok'
              ? 'text-emerald-600 bg-emerald-50'
              : backendStatus === 'degraded'
              ? 'text-amber-600 bg-amber-50'
              : 'text-red-600 bg-red-50'
          }`}>
            <span className={`relative flex h-2 w-2`}>
              {backendStatus === 'ok' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                backendStatus === 'ok' ? 'bg-emerald-400' : backendStatus === 'degraded' ? 'bg-amber-400' : 'bg-red-400'
              }`} />
            </span>
            {backendStatus === 'ok' ? 'Snowflake Connected' : backendStatus === 'degraded' ? 'Degraded' : 'Disconnected'}
          </div>
        </div>
      </motion.div>

      {/* Error banner */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </motion.div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              label="Databases"
              value={dashboardData?.totalDatabases || 0}
              subtitle="Snowflake databases"
              icon={<Database className="w-4 h-4" />}
              color="blue"
              delay={0}
            />
            <MetricCard
              label="Tables"
              value={dashboardData?.totalTables || 0}
              subtitle="Across all schemas"
              icon={<Layers className="w-4 h-4" />}
              color="emerald"
              delay={1}
            />
            <MetricCard
              label="Warehouses"
              value={dashboardData?.totalWarehouses || 0}
              subtitle={`${dashboardData?.runningWarehouses || 0} running`}
              icon={<Zap className="w-4 h-4" />}
              color="purple"
              delay={2}
            />
            <MetricCard
              label="Queries"
              value={queryHistory.length}
              subtitle="Recent query history"
              icon={<Activity className="w-4 h-4" />}
              color="amber"
              live={backendStatus === 'ok'}
              delay={3}
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Area Chart */}
        <Card className="lg:col-span-2" padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--color-accent)]" />
              <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Query Trends</h3>
              <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface)] px-1.5 py-0.5 rounded font-mono">Live</span>
            </div>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="h-[200px] bg-[var(--color-surface)] rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={queryTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="queryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="queries"
                    name="Rows"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#queryGrad)"
                    dot={{ r: 3, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                    isAnimationActive={true}
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Warehouse Distribution */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Warehouses</h3>
            </div>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-[var(--color-surface)] rounded-lg animate-pulse" />
                ))}
              </div>
            ) : dashboardData && dashboardData.warehouses.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.warehouses.map((wh) => (
                  <div key={wh.name} className="flex items-center justify-between p-3 bg-[var(--color-surface)] rounded-xl">
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <div>
                        <span className="text-sm font-semibold text-[var(--color-text-main)]">{wh.name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-[var(--color-text-muted)]">{wh.size || '—'}</span>
                          <span className="text-[11px] text-[var(--color-text-light)]">·</span>
                          <span className="text-[11px] text-[var(--color-text-muted)]">{wh.running} active</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      status={wh.state === 'RUNNING' ? 'active' : wh.state === 'SUSPENDED' ? 'expired' : 'pending'}
                      label={wh.state}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-[var(--color-text-muted)]">
                No warehouse data available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Activity + DB Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Queries */}
        <Card className="lg:col-span-2" padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--color-accent)]" />
              <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Recent Queries</h3>
            </div>
            <button
              onClick={() => navigate(ROUTES.MONITORING)}
              className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton variant="text" width="60%" height={14} />
                      <Skeleton variant="text" width="40%" height={12} />
                    </div>
                  </div>
                </div>
              ))
            ) : recentActivity.length > 0 ? (
              recentActivity.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface)]/50 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${actionColors[item.type] || actionColors.query}`}>
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-main)]">
                      <span className="font-semibold">{item.user}</span>{' '}
                      <span className="text-[var(--color-text-muted)]">{item.action}</span>
                    </p>
                    <p className="text-[11px] text-[var(--color-text-light)] font-mono truncate max-w-xs">{item.target}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={item.status as any} />
                    <span className="text-[11px] text-[var(--color-text-light)] tabular-nums">{item.time}</span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                No recent queries. Run a query in the workspace to see activity here.
              </div>
            )}
          </div>
        </Card>

        {/* Databases */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[var(--color-accent)]" />
              <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Databases</h3>
            </div>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-[300px] overflow-y-auto">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3">
                  <Skeleton variant="text" width="70%" height={14} />
                </div>
              ))
            ) : dashboardData && dashboardData.databases.length > 0 ? (
              dashboardData.databases.slice(0, 10).map((db, i) => (
                <motion.div
                  key={db}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface)]/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <span className="text-sm font-medium text-[var(--color-text-main)] font-mono">{db}</span>
                </motion.div>
              ))
            ) : (
              <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                No databases found
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text-main)] mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Create Skill', desc: 'Add a new AI skill', icon: Puzzle, color: 'blue', route: ROUTES.SKILLS },
              { label: 'Manage Models', desc: 'Configure AI access', icon: Brain, color: 'purple', route: ROUTES.MODELS },
              { label: 'View Monitoring', desc: 'Audit logs & metrics', icon: Activity, color: 'amber', route: ROUTES.MONITORING },
              { label: 'Open Workspace', desc: 'SQL chat & explorer', icon: Database, color: 'emerald', route: ROUTES.WORKSPACE },
            ].map((action, i) => {
              const Icon = action.icon;
              const colorClasses: Record<string, { bg: string; hover: string; icon: string }> = {
                blue: { bg: 'bg-blue-50', hover: 'hover:bg-blue-100 hover:border-blue-200', icon: 'text-blue-500' },
                purple: { bg: 'bg-purple-50', hover: 'hover:bg-purple-100 hover:border-purple-200', icon: 'text-purple-500' },
                amber: { bg: 'bg-amber-50', hover: 'hover:bg-amber-100 hover:border-amber-200', icon: 'text-amber-500' },
                emerald: { bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100 hover:border-emerald-200', icon: 'text-emerald-500' },
              };
              const c = colorClasses[action.color];
              return (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  onClick={() => navigate(action.route)}
                  className={`flex items-center gap-3 p-4 rounded-xl border border-transparent transition-all duration-200 ${c.bg} ${c.hover} group/action`}
                >
                  <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0 transition-transform group-hover/action:scale-110`}>
                    <Icon className={`w-5 h-5 ${c.icon}`} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-semibold text-[var(--color-text-main)]">{action.label}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">{action.desc}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[var(--color-text-light)] opacity-0 group-hover/action:opacity-100 transition-opacity" />
                </motion.button>
              );
            })}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
