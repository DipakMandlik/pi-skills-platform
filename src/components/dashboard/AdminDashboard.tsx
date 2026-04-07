import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import {
  Brain, Activity, TrendingUp, Zap,
  AlertCircle, RefreshCw, Sparkles, Terminal, DollarSign,
  CheckCircle2, XCircle, Clock,
  ArrowRight, Database, Shield,
} from 'lucide-react';
import { Card, MetricCardSkeleton } from '../common';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { fetchDashboardData, fetchQueryHistory, type DashboardData, type QueryHistoryEntry } from '../../api/snowflakeService';
import { fetchHealth, fetchMonitoring, type AuditLogEntry } from '../../services/backendApi';
import { cn } from '../../lib/cn';

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-elevated border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted">{entry.name}:</span>
          <span className="font-mono font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Cosmic star field background (pure CSS) ── */
const CosmicBg = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
    {/* Deep space base */}
    <div className="absolute inset-0" style={{
      background: 'radial-gradient(ellipse 120% 80% at 60% 40%, #0d1b3e 0%, #090d1f 40%, #050810 100%)',
    }} />
    {/* Nebula wisps */}
    <div className="absolute inset-0 opacity-70" style={{
      background: `
        radial-gradient(ellipse 90% 50% at 55% 35%, rgba(41,181,232,0.18) 0%, transparent 65%),
        radial-gradient(ellipse 60% 40% at 75% 25%, rgba(99,102,241,0.14) 0%, transparent 60%),
        radial-gradient(ellipse 50% 60% at 30% 60%, rgba(16,24,64,0.9) 0%, transparent 70%),
        radial-gradient(ellipse 40% 30% at 85% 70%, rgba(41,181,232,0.08) 0%, transparent 55%)
      `,
    }} />
    {/* Bright light streak */}
    <div className="absolute" style={{
      top: '20%', left: '25%', width: '65%', height: '60%',
      background: 'radial-gradient(ellipse 80% 30% at 55% 45%, rgba(120,180,255,0.12) 0%, rgba(41,181,232,0.06) 40%, transparent 70%)',
      transform: 'rotate(-12deg)',
      filter: 'blur(4px)',
    }} />
    {/* Stars layer 1 — small bright */}
    {[
      [8,15],[15,72],[23,42],[31,18],[38,85],[44,56],[52,28],[59,68],[66,12],[73,90],
      [79,38],[85,64],[91,22],[6,50],[20,88],[47,8],[62,45],[88,78],[35,33],[70,55],
    ].map(([t,l],i) => (
      <div key={i} className="absolute rounded-full" style={{
        top: `${t}%`, left: `${l}%`,
        width: i % 3 === 0 ? '2px' : '1.5px',
        height: i % 3 === 0 ? '2px' : '1.5px',
        background: i % 4 === 0 ? 'rgba(41,181,232,0.9)' : 'rgba(200,220,255,0.7)',
        boxShadow: i % 4 === 0 ? '0 0 4px rgba(41,181,232,0.6)' : '0 0 2px rgba(200,220,255,0.4)',
      }} />
    ))}
    {/* Stars layer 2 — faint distant */}
    {[
      [5,30],[12,65],[28,10],[42,78],[55,22],[68,48],[81,15],[94,72],[18,92],[36,55],
      [50,40],[75,25],[88,58],[3,82],[25,45],[60,80],[82,35],[10,20],[45,63],[72,8],
    ].map(([t,l],i) => (
      <div key={`s2-${i}`} className="absolute rounded-full" style={{
        top: `${t}%`, left: `${l}%`,
        width: '1px', height: '1px',
        background: 'rgba(180,200,255,0.4)',
      }} />
    ))}
    {/* Bottom fade to content */}
    <div className="absolute bottom-0 inset-x-0 h-1/3" style={{
      background: 'linear-gradient(to bottom, transparent, rgba(5,8,16,0.6))',
    }} />
  </div>
);

/* ── Audit event icon ── */
const AuditIcon = ({ type }: { type: 'success' | 'error' | 'warn' | 'info' }) => {
  const map = {
    success: { Icon: CheckCircle2, bg: 'bg-emerald-500/15', color: 'text-emerald-400', ring: 'ring-emerald-500/20' },
    error: { Icon: XCircle, bg: 'bg-red-500/15', color: 'text-red-400', ring: 'ring-red-500/20' },
    warn: { Icon: AlertCircle, bg: 'bg-amber-500/15', color: 'text-amber-400', ring: 'ring-amber-500/20' },
    info: { Icon: Database, bg: 'bg-blue-500/15', color: 'text-blue-400', ring: 'ring-blue-500/20' },
  }[type];
  return (
    <div className={cn('p-1.5 rounded-lg ring-1', map.bg, map.ring)}>
      <map.Icon className={cn('w-3.5 h-3.5', map.color)} />
    </div>
  );
};

function getFallbackDashboardData(): DashboardData {
  return {
    databases: ['DEMO_ANALYTICS', 'DEMO_FINANCE', 'DEMO_SECURITY'],
    schemas: ['PUBLIC', 'RAW', 'MART'],
    tables: ['FACT_USAGE', 'FACT_COST', 'DIM_USERS', 'DIM_SKILLS', 'FACT_EVENTS'],
    warehouses: [
      { name: 'DEMO_WH_XS', state: 'RUNNING', size: 'X-SMALL', running: 3, queued: 0 },
      { name: 'DEMO_WH_M', state: 'SUSPENDED', size: 'MEDIUM', running: 0, queued: 2 },
      { name: 'DEMO_WH_L', state: 'RUNNING', size: 'LARGE', running: 1, queued: 0 },
    ],
    totalDatabases: 3,
    totalSchemas: 3,
    totalTables: 5,
    totalWarehouses: 3,
    runningWarehouses: 2,
    connected: true,
  };
}

function getFallbackQueryHistory(): QueryHistoryEntry[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `demo_q_${i + 1}`,
    query_text: `SELECT * FROM DEMO_ANALYTICS.PUBLIC.FACT_USAGE LIMIT ${100 + i * 10};`,
    status: i % 7 === 0 ? 'ERROR' : 'SUCCESS',
    start_time: new Date(Date.now() - i * 300_000).toISOString(),
    end_time: new Date(Date.now() - i * 300_000 + 1400).toISOString(),
    total_elapsed_time: 900 + i * 35,
    bytes_scanned: 10_000_000 + i * 250_000,
    rows_produced: 150 + i * 20,
    user_name: i % 2 === 0 ? 'platform_admin' : 'analytics_user',
    warehouse_name: i % 2 === 0 ? 'DEMO_WH_XS' : 'DEMO_WH_L',
  }));
}

function getFallbackAuditLogs(): AuditLogEntry[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `demo_log_${i + 1}`,
    request_id: `demo_req_${9000 + i}`,
    user_id: i % 2 === 0 ? 'user_admin' : 'user_analyst',
    skill_id: ['query-optimizer', 'schema-explorer', 'data-quality-check'][i % 3],
    model_id: ['gpt-4o-mini', 'claude-3-haiku-20240307', 'gemini-1.5-pro'][i % 3],
    action: ['execute', 'policy_check', 'validate'][i % 3],
    outcome: i % 5 === 0 ? 'denied' : 'allowed',
    tokens_used: 800 + i * 170,
    latency_ms: 180 + i * 45,
    timestamp: new Date(Date.now() - i * 420_000).toISOString(),
  }));
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'ok' | 'degraded' | 'error'>('degraded');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [dashError, setDashError] = useState(false);
  const [histError, setHistError] = useState(false);
  const [monError, setMonError] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setDashError(false);
    setHistError(false);
    setMonError(false);
    try {
      const health = await fetchHealth();
      setBackendStatus(health?.status === 'ok' ? 'ok' : 'degraded');
    } catch {
      setBackendStatus('error');
    }
    const [data, history, monitoring] = await Promise.allSettled([
      fetchDashboardData(),
      fetchQueryHistory(10),
      fetchMonitoring({ page: 1, page_size: 5 }),
    ]);
    if (data.status === 'fulfilled') {
      const hasSnowflakeData =
        data.value.totalWarehouses > 0
        || data.value.totalDatabases > 0
        || data.value.totalTables > 0;
      setDashboardData(hasSnowflakeData ? data.value : getFallbackDashboardData());
    } else {
      setDashboardData(getFallbackDashboardData());
      setDashError(true);
    }
    if (history.status === 'fulfilled') {
      setQueryHistory(history.value.length > 0 ? history.value : getFallbackQueryHistory());
    } else {
      setQueryHistory(getFallbackQueryHistory());
      setHistError(true);
    }
    if (monitoring.status === 'fulfilled') {
      setAuditLogs(monitoring.value.logs.length > 0 ? monitoring.value.logs : getFallbackAuditLogs());
    } else {
      setAuditLogs(getFallbackAuditLogs());
      setMonError(true);
    }
    if (data.status === 'rejected' && history.status === 'rejected' && monitoring.status === 'rejected') {
      setError('All data sources are currently unavailable. Check your connections.');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const queryTrend = queryHistory.length > 0
    ? queryHistory.slice(0, 7).reverse().map((q, i) => ({
        day: `Q${i + 1}`, queries: q.rows_produced || 1,
        errors: q.status === 'ERROR' ? 1 : 0, elapsed: q.total_elapsed_time,
      }))
    : Array.from({ length: 7 }, (_, i) => ({ day: `D${i + 1}`, queries: 0, errors: 0, elapsed: 0 }));

  const recentActivity = queryHistory.slice(0, 6).map((q) => ({
    id: q.id, user: q.user_name || 'System',
    target: q.query_text.length > 70 ? q.query_text.substring(0, 70) + '...' : q.query_text,
    time: q.start_time ? new Date(q.start_time).toLocaleTimeString() : '—',
    type: q.status === 'ERROR' ? 'error' : 'query',
    status: q.status === 'ERROR' ? 'ERROR' : q.status === 'RUNNING' ? 'RUNNING' : 'SUCCESS',
  }));

  const statusConfig = {
    ok: { label: 'Systems Optimal', dot: 'bg-emerald-500', pulse: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/25' },
    degraded: { label: 'Degraded Link', dot: 'bg-amber-500', pulse: '', text: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/25' },
    error: { label: 'Disconnected', dot: 'bg-red-500', pulse: '', text: 'text-red-400', bg: 'bg-red-400/10 border-red-400/25' },
  }[backendStatus];

  return (
    <div className="space-y-4 pb-4">

      {/* ── Error banner ── */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-3 bg-error/10 border border-error/30 rounded-xl">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span className="text-sm font-medium text-error">{error}</span>
        </motion.div>
      )}

      {/* ── Hero: Morning Briefing ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-[#1a2a4a] shadow-2xl"
        style={{ minHeight: '160px' }}
      >
        <CosmicBg />

        {/* Status badge */}
        <div className="absolute top-4 right-4 z-10">
          <div className={cn('flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border', statusConfig.bg, statusConfig.text)}>
            <span className="relative flex h-2 w-2">
              {backendStatus === 'ok' && (
                <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-70', statusConfig.pulse)} />
              )}
              <span className={cn('relative inline-flex rounded-full h-2 w-2', statusConfig.dot)} />
            </span>
            {statusConfig.label}
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start gap-4 p-6 sm:p-7">
          <div className="p-3 rounded-xl border border-[#29b5e8]/30 bg-[#29b5e8]/10 shrink-0 backdrop-blur-sm">
            <Sparkles className="w-6 h-6 text-[#29b5e8]" />
          </div>
          <div className="flex-1 pr-28">
            <h2 className="text-xl font-bold text-white mb-2.5 tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
              Morning Briefing
            </h2>
            <p className="text-slate-300/90 leading-relaxed font-mono text-[13px] max-w-2xl">
              Live telemetry combines Snowflake workspace signals with governance audit events when those services are available.
            </p>
            <p className="text-slate-300/90 leading-relaxed font-mono text-[13px] max-w-2xl mt-1">
              Refresh to pull the latest warehouse activity, query history, and policy execution signals for this environment.
            </p>
            <div className="mt-4">
              <button
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#29b5e8] hover:text-[#5dcbf0] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                Refresh Telemetry
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Vitals Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          <><MetricCardSkeleton /><MetricCardSkeleton /><MetricCardSkeleton /><MetricCardSkeleton /></>
        ) : (
          <>
            {/* Active Warehouses */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              className="group relative bg-surface rounded-2xl border border-border/70 p-5 overflow-hidden hover:border-border-hover hover:shadow-lg transition-all duration-200 cursor-default"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start justify-between mb-5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 group-hover:scale-110 transition-transform duration-200">
                  <Zap className="w-5 h-5 text-blue-400" />
                </div>
                <span className="relative flex h-3 w-3 mt-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                </span>
              </div>
              {dashError ? (
                <div className="text-sm font-medium text-amber-500/80 mt-1">Unavailable</div>
              ) : (
                <div className="text-3xl font-bold text-foreground tracking-tight tabular-nums">
                  {dashboardData?.runningWarehouses ?? 0}
                </div>
              )}
              <div className="text-[13px] font-medium text-muted mt-1">Active Warehouses</div>
              <div className="text-[11px] text-muted/55 mt-2 font-mono">
                {dashError ? 'Snowflake unreachable' : `Out of ${dashboardData?.totalWarehouses ?? 0} provisioned`}
              </div>
            </motion.div>

            {/* Queries / Sec */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
              className="group relative bg-surface rounded-2xl border border-border/70 p-5 overflow-hidden hover:border-border-hover hover:shadow-lg transition-all duration-200 cursor-default"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 group-hover:scale-110 transition-transform duration-200">
                  <Activity className="w-5 h-5 text-violet-400" />
                </div>
              </div>
              {/* Sparkline */}
              <div className="absolute -bottom-1 left-0 right-0 h-16 opacity-25">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={queryTrend} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="queries" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#qGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="relative z-10">
                {histError ? (
                  <div className="text-sm font-medium text-amber-500/80 mt-1">Unavailable</div>
                ) : (
                  <div className="text-3xl font-bold text-foreground tracking-tight tabular-nums">
                    {queryHistory.length.toFixed(1)}
                  </div>
                )}
                <div className="text-[13px] font-medium text-muted mt-1">Queries / Sec</div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 mt-2">
                  {histError ? (
                    <span className="text-amber-400">Query history unavailable</span>
                  ) : (
                    <><TrendingUp className="w-3 h-3" /> {queryHistory.length > 0 ? 'Live sample loaded' : 'No live sample'}</>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Credit Burn Rate */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
              className="group relative bg-surface rounded-2xl border border-border/70 p-5 overflow-hidden hover:border-border-hover hover:shadow-lg transition-all duration-200 cursor-default"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start justify-between mb-5">
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 group-hover:scale-110 transition-transform duration-200">
                  <DollarSign className="w-5 h-5 text-rose-400" />
                </div>
              </div>
              <div>
                {monError ? (
                  <div className="text-sm font-medium text-amber-500/80 mt-1">Unavailable</div>
                ) : (
                  <div className="text-3xl font-bold text-foreground tracking-tight tabular-nums">
                    {((auditLogs.reduce((sum, log) => sum + (log.tokens_used || 0), 0)) / 1000).toFixed(1)} <span className="text-base text-muted/60 font-semibold">K tok</span>
                  </div>
                )}
                <div className="text-[13px] font-medium text-muted mt-1">Recent Token Usage</div>
                <div className="text-[11px] text-muted/55 mt-2 font-mono">
                  {monError ? 'Audit log unavailable' : 'From latest audit events'}
                </div>
              </div>
            </motion.div>

            {/* Active AI Skills */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23 }}
              className="group relative bg-surface rounded-2xl border border-border/70 p-5 overflow-hidden hover:border-border-hover hover:shadow-lg transition-all duration-200 cursor-default"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start justify-between mb-5">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-110 transition-transform duration-200">
                  <Brain className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 rounded-md">
                  Deployed
                </span>
              </div>
              <div>
                {monError ? (
                  <div className="text-sm font-medium text-amber-500/80 mt-1">Unavailable</div>
                ) : (
                  <div className="text-3xl font-bold text-foreground tracking-tight tabular-nums">{new Set(auditLogs.map((log) => log.skill_id).filter(Boolean)).size}</div>
                )}
                <div className="text-[13px] font-medium text-muted mt-1">Active AI Skills</div>
                <div className="text-[11px] text-muted/55 mt-2 font-mono">
                  {monError ? 'Audit log unavailable' : 'Observed in recent audit stream'}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* ── Bottom Row: Terminal + Audit ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Terminal — 3 cols */}
        <motion.div
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.28 }}
          className="lg:col-span-3"
        >
          <div className="relative h-full rounded-2xl overflow-hidden border border-[#1a2a40] shadow-xl flex flex-col" style={{ minHeight: '240px' }}>
            {/* Cosmic bg for terminal */}
            <CosmicBg />

            {/* Terminal chrome */}
            <div className="relative z-10 flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-black/20 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-400 transition-colors cursor-pointer" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-400 transition-colors cursor-pointer" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-400 transition-colors cursor-pointer" />
                </div>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <Terminal className="w-3.5 h-3.5 text-[#29b5e8]" />
                <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-widest">
                  Real-Time Stream
                </span>
              </div>
              {/* Live indicator */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                LIVE
              </div>
            </div>

            {/* Log entries */}
            <div className="relative z-10 flex-1 p-4 font-mono text-[12px] overflow-y-auto space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="animate-pulse">▋</span>
                  <span className="animate-pulse">Initializing connection...</span>
                </div>
              ) : recentActivity.length > 0 ? (
                recentActivity.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="group flex items-start gap-3"
                  >
                    <span className="text-slate-500 shrink-0 tabular-nums mt-0.5">{item.time}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide',
                          item.status === 'ERROR' ? 'bg-red-500/20 text-red-400 border border-red-500/20' :
                          item.status === 'RUNNING' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                          'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                        )}>
                          {item.status}
                        </span>
                        <span className="text-slate-200 font-semibold">{item.user}</span>
                      </div>
                      <div className="text-slate-400 break-words group-hover:text-[#29b5e8] transition-colors">
                        <span className="text-slate-600 mr-2 select-none">$</span>
                        {item.target}
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-slate-500">
                  <span className="text-slate-600 mr-2 select-none">$</span>
                  <span>tail -f /var/log/platform/queries.log</span>
                  <span className="animate-pulse ml-1 text-slate-400">▋</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Audit Events — 2 cols */}
        <motion.div
          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}
          className="lg:col-span-2"
        >
          <Card padding="none" className="h-full flex flex-col shadow-sm min-h-[240px]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted/10">
                  <Activity className="w-3.5 h-3.5 text-muted" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Recent Audit Events</h3>
              </div>
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/40">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-14 rounded-xl bg-surface-hover animate-pulse" />
                  ))}
                </div>
              ) : monError ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <p className="text-sm font-medium text-muted">Audit log unavailable</p>
                  <button onClick={loadData} className="text-xs text-primary underline">Retry</button>
                </div>
              ) : auditLogs.length > 0 ? (
                auditLogs.map((log, i) => {
                  const isSuccess = log.outcome === 'success' || log.outcome === 'ALLOW';
                  const isError = log.outcome === 'error' || log.outcome === 'ERROR';
                  const iconType = isSuccess ? 'success' : isError ? 'error' : 'warn';
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-hover transition-colors cursor-pointer group"
                    >
                      <AuditIcon type={iconType} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {log.action}
                        </div>
                        <div className="text-[11px] text-muted truncate mt-0.5 font-mono">
                          {log.skill_id || log.model_id || log.user_id?.slice(0, 8) || '—'}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5 text-[10px] text-muted/70 font-mono">
                        <span>{log.latency_ms ? `${log.latency_ms}ms` : '—'}</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="px-4 py-10 text-sm text-muted">No recent audit events available yet.</div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border/60 bg-surface-hover/30 shrink-0">
              <button
                onClick={() => navigate(ROUTES.MONITORING)}
                className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                View all events <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
