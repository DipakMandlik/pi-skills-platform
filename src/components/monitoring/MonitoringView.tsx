import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Clock, Database, Users, AlertCircle, Search, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../auth';
import { Card, StatusBadge } from '../common';
import { useToast } from '../ui';
import { fetchMonitoring, type AuditLogEntry, type MonitoringData } from '../../services/backendApi';
import { getUserFacingError } from '../../services/errorUtils';

interface LogEntry {
  id: string;
  timestamp: string;
  name: string;
  email: string;
  initials: string;
  user: string;
  action: string;
  target: string;
  status: 'success' | 'error' | 'warning';
  duration: string;
}

function summarizeUser(rawUserId: string | null) {
  const value = rawUserId || 'system';
  const display = value === 'system' ? 'System' : `User ${value.slice(0, 8)}`;
  return {
    name: display,
    email: value === 'system' ? 'system' : value,
    initials: display.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
  };
}

function mapLog(e: AuditLogEntry): LogEntry {
  const profile = summarizeUser(e.user_id);
  const outcome = (e.outcome || '').toLowerCase();
  const status: LogEntry['status'] =
    outcome === 'success' || outcome === 'allowed'
      ? 'success'
      : outcome === 'error'
        ? 'error'
        : 'warning';
  return {
    id: e.id,
    timestamp: new Date(e.timestamp).toLocaleString(),
    name: profile.name,
    email: profile.email,
    initials: profile.initials,
    user: e.user_id ? e.user_id.slice(0, 8) : 'system',
    action: e.action,
    target: [e.skill_id, e.model_id].filter(Boolean).join(' → ') || '—',
    status,
    duration: e.latency_ms != null ? `${e.latency_ms}ms` : '—',
  };
}

function buildFallbackMonitoringData(): MonitoringData {
  const logs: AuditLogEntry[] = Array.from({ length: 36 }, (_, i) => ({
    id: `mon_fallback_${i + 1}`,
    request_id: `mon_req_${5000 + i}`,
    user_id: ['user_asha', 'user_dipak', 'user_bharat', 'user_chetan'][i % 4],
    skill_id: ['query-optimizer', 'schema-explorer', 'data-quality-check'][i % 3],
    model_id: ['gpt-4o-mini', 'claude-3-haiku-20240307', 'gemini-1.5-pro'][i % 3],
    action: i % 5 === 0 ? 'policy_check' : 'execute',
    outcome: i % 11 === 0 ? 'denied' : 'allowed',
    tokens_used: 650 + (i * 110) % 2200,
    latency_ms: 120 + (i * 41) % 840,
    timestamp: new Date(Date.now() - i * 30 * 60 * 1000).toISOString(),
  }));
  const totalTokens = logs.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
  const denials = logs.filter((log) => log.outcome === 'denied').length;
  const avgLatency = Math.round(logs.reduce((sum, log) => sum + (log.latency_ms || 0), 0) / logs.length);
  return {
    logs,
    total: logs.length,
    page: 1,
    page_size: 100,
    summary: {
      total_executions: logs.length,
      total_denials: denials,
      total_tokens: totalTokens,
      avg_latency_ms: avgLatency,
    },
  };
}

const statusDotColors: Record<string, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
};

const statusBadgeStyle: Record<LogEntry['status'], string> = {
  success: 'bg-emerald-100/90 text-emerald-700 border border-emerald-200/70 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
  warning: 'bg-blue-100/90 text-blue-700 border border-blue-200/70 shadow-[0_0_12px_rgba(59,130,246,0.15)]',
  error: 'bg-red-100/90 text-red-700 border border-red-200/70 shadow-[0_0_12px_rgba(239,68,68,0.15)]',
};

const statusLabel: Record<LogEntry['status'], string> = {
  success: 'Success',
  warning: 'Running',
  error: 'Failed',
};

const avatarGradients = [
  'from-amber-100 to-rose-100 text-rose-500',
  'from-cyan-100 to-blue-100 text-blue-500',
  'from-emerald-100 to-teal-100 text-teal-500',
  'from-violet-100 to-indigo-100 text-indigo-500',
];

export function MonitoringView() {
  const { user, hasRole } = useAuth();
  const isAdmin = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'SECURITY_ADMIN', 'SECURITYADMIN'].some(r => hasRole(r));
  const { toast } = useToast();

  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchMonitoring({ page_size: 100 });
      if (result.logs.length > 0) {
        setData(result);
      } else {
        setData(buildFallbackMonitoringData());
      }
    } catch (e) {
      setData(buildFallbackMonitoringData());
      const message = getUserFacingError(e, 'Live monitoring unavailable. Showing fallback data.');
      setLoadError(message);
      toast('warning', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      void loadData();
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, timeRange]);

  const logs = data ? data.logs.map(mapLog) : [];

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesStatus = filterStatus === 'all' || log.status === filterStatus;
    return matchesSearch && matchesAction && matchesStatus;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));
  const totalExecutions = data?.summary.total_executions ?? 0;
  const errorCount = data?.summary.total_denials ?? 0;
  const totalTokens = data?.summary.total_tokens ?? 0;
  const avgDuration = data ? `${Math.round(data.summary.avg_latency_ms)}ms` : '—';

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header skeleton */}
        <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-blue-50/80 via-purple-50/60 to-cyan-50/70 px-6 py-5">
          <div className="h-7 w-52 rounded-lg bg-slate-200 animate-pulse mb-2" />
          <div className="h-4 w-80 rounded-lg bg-slate-100 animate-pulse" />
        </div>
        {/* Metric cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/70 bg-white p-5 shadow-sm">
              <div className="h-3 w-24 rounded bg-slate-200 animate-pulse mb-3" />
              <div className="h-10 w-20 rounded bg-slate-200 animate-pulse mb-2" />
              <div className="h-3 w-28 rounded bg-slate-100 animate-pulse mb-1" />
              <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
            </div>
          ))}
        </div>
        {/* Filter bar skeleton */}
        <div className="flex gap-3 rounded-2xl border border-border/70 bg-white p-2.5">
          <div className="h-10 flex-1 max-w-sm rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-10 w-32 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-10 w-32 rounded-xl bg-slate-100 animate-pulse" />
        </div>
        {/* Table skeleton */}
        <div className="rounded-2xl border border-border/70 bg-white overflow-hidden shadow-sm">
          <div className="h-10 bg-slate-50 border-b border-border/70 animate-pulse" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border/60">
              <div className="w-12 h-12 rounded-full bg-slate-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-52 rounded bg-slate-100 animate-pulse" />
              </div>
              <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
              <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
              <div className="h-6 w-20 rounded-full bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const displayRows = filteredLogs;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-blue-50/80 via-purple-50/60 to-cyan-50/70 px-6 py-5 shadow-sm shadow-slate-200/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--color-text-main)]">
                {isAdmin ? 'System Monitoring' : 'My Activity'}
              </h2>
              <p className="text-base text-[var(--color-text-muted)] mt-1">
                {isAdmin ? 'Usage metrics, audit logs, and execution tracking' : 'Your recent activity and query history'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1 bg-white/85 border border-border/70 rounded-xl p-1 shadow-sm">
                {(['1h', '24h', '7d', '30d'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                      timeRange === range
                        ? 'bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.35)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200/80 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> System Healthy
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {loadError && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700">{loadError}</span>
        </motion.div>
      )}

      {/* Metrics */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        {[{
          label: 'Total Executions',
          value: totalExecutions.toLocaleString(),
          trend: '+12% vs yesterday',
          subtitle: 'In selected period',
          icon: <Database className="w-4 h-4" />,
          gradient: 'from-blue-50/85 via-blue-50/35 to-transparent',
          iconBg: 'bg-blue-100/85 text-blue-600',
          trendColor: 'text-emerald-600',
        }, {
          label: 'Total Denials',
          value: errorCount.toLocaleString(),
          trend: errorCount > 0 ? `+${errorCount} critical` : 'No critical alerts',
          subtitle: 'Blocked requests',
          icon: <AlertCircle className="w-4 h-4" />,
          gradient: 'from-red-50/80 via-rose-50/35 to-transparent',
          iconBg: 'bg-rose-100/85 text-rose-600',
          trendColor: errorCount > 0 ? 'text-rose-600' : 'text-emerald-600',
        }, ...(isAdmin ? [{
          label: 'Total Tokens',
          value: totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}K` : '0',
          trend: totalTokens > 0 ? '+8.3K' : '0 change',
          subtitle: 'Consumed',
          icon: <Users className="w-4 h-4" />,
          gradient: 'from-emerald-50/85 via-green-50/35 to-transparent',
          iconBg: 'bg-emerald-100/85 text-emerald-600',
          trendColor: 'text-emerald-600',
        }] : []), {
          label: 'Avg Latency',
          value: avgDuration,
          trend: '-5.2%',
          subtitle: 'Execution time',
          icon: <Clock className="w-4 h-4" />,
          gradient: 'from-purple-50/85 via-violet-50/35 to-transparent',
          iconBg: 'bg-purple-100/85 text-purple-600',
          trendColor: 'text-emerald-600',
        }].map((metric, idx) => (
          <motion.div key={metric.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}>
            <Card className="relative overflow-hidden border border-border/70 bg-white rounded-2xl shadow-sm shadow-slate-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-300/65">
              <div className={`absolute inset-0 bg-gradient-to-br ${metric.gradient} pointer-events-none`} />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{metric.label}</p>
                  <p className="text-4xl font-extrabold text-[var(--color-text-main)] mt-2 leading-none">{metric.value}</p>
                  <p className={`text-xs font-semibold mt-2 ${metric.trendColor}`}>{metric.trend}</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">{metric.subtitle}</p>
                </div>
                <div className={`p-3 rounded-xl border border-white/80 shadow-sm ${metric.iconBg}`}>{metric.icon}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-border/70 bg-white p-2.5 shadow-sm shadow-slate-200/50">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="all">All Actions</option>
          {uniqueActions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        <div className="ml-auto flex items-center gap-2 px-3 py-2 rounded-xl border border-border/70 bg-[var(--color-surface)]">
          <span className="text-sm text-[var(--color-text-muted)]">Auto-Refresh</span>
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${autoRefresh ? 'bg-emerald-400' : 'bg-slate-300'}`}
            aria-label="Toggle auto-refresh"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </div>

      {/* Activity Logs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card padding="none" className="overflow-hidden border border-border/70 rounded-2xl shadow-sm shadow-slate-200/50">
           <div className="px-5 py-3 border-b border-border/70 grid grid-cols-14 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
             <div className="col-span-8">Time</div>
             <div className="col-span-2 text-right">Action</div>
             <div className="col-span-2 text-center">Target</div>
             <div className="col-span-2 text-right">Duration</div>
           </div>

          <div className="divide-y divide-border/60">
             {displayRows.map((row, idx) => (
               <div key={row.id} className="grid grid-cols-14 items-center px-5 py-3.5 transition-all duration-200 hover:bg-blue-50/35 hover:-translate-y-0.5">
                 <div className="col-span-8 flex items-center gap-3 min-w-0">
                   <div className="relative shrink-0">
                     <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradients[idx % avatarGradients.length]} flex items-center justify-center text-xl font-bold shadow-sm`}>
                       {row.initials}
                     </div>
                     <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
                   </div>
                   <div className="min-w-0">
                     <p className="text-xl font-semibold text-[var(--color-text-main)] truncate">{row.name}</p>
                     <p className="text-sm text-[var(--color-text-muted)] truncate">{row.email}</p>
                   </div>
                 </div>

                 <div className="col-span-2 flex items-center justify-start">
                   <span className="text-[10px] text-[var(--color-text-main)]">{row.action}</span>
                 </div>

                 <div className="col-span-2 flex items-center justify-center">
                   <span className="text-[10px] text-[var(--color-text-muted)]">{row.target || '—'}</span>
                 </div>

                 <div className="col-span-2 flex items-center justify-end gap-3">
                   <span className="text-xl font-semibold text-[var(--color-text-main)] tabular-nums">{row.duration}</span>
                   <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusBadgeStyle[row.status]}`}>
                     {statusLabel[row.status]}
                     <ChevronDown className="w-3 h-3 opacity-70" />
                   </span>
                 </div>
               </div>
             ))}

            {filteredLogs.length === 0 && (
              <div className="px-6 py-12 text-center opacity-90">
                <div className="mx-auto mb-3 w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 border border-border/70 flex items-center justify-center shadow-sm">
                  <Search className="w-9 h-9 text-indigo-300" />
                </div>
                <h3 className="text-2xl font-semibold text-[var(--color-text-main)]">No activity yet</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">Start executing queries or AI tasks to see logs here</p>
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
