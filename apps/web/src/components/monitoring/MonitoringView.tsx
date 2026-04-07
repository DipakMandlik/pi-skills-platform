import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import {
  Clock, Database, Users, Zap, AlertCircle, Search, Download, BarChart3,
} from 'lucide-react';
import { useAuth } from '../../auth';
import { Card, MetricCard, DataTable, StatusBadge, EmptyState, Tabs } from '../common';
import type { Column } from '../common';

interface LogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  target: string;
  status: 'success' | 'error' | 'warning';
  duration: string;
}

interface WarehouseInfo {
  name: string;
  state: 'RUNNING' | 'SUSPENDED' | 'STARTING';
  size: string;
  queries: number;
  credits: number;
}

const MOCK_LOGS: LogEntry[] = [
  { id: 'l1', timestamp: '2026-03-25 14:32:18', user: 'Dipak Mandlik', action: 'CREATE_SKILL', target: 'Cortex Analyst Builder', status: 'success', duration: '120ms' },
  { id: 'l2', timestamp: '2026-03-25 14:28:05', user: 'Chetan Thorat', action: 'RUN_QUERY', target: 'SELECT * FROM BANKING.BRONZE.ACCOUNT', status: 'success', duration: '340ms' },
  { id: 'l3', timestamp: '2026-03-25 14:25:42', user: 'Omkar Wakchaure', action: 'ASSIGN_SKILL', target: 'SQL Writer → Data Analyst', status: 'success', duration: '85ms' },
  { id: 'l4', timestamp: '2026-03-25 14:20:11', user: 'Rushikesh Joshi', action: 'RUN_QUERY', target: 'SHOW TABLES IN BANKING.SILVER', status: 'success', duration: '210ms' },
  { id: 'l5', timestamp: '2026-03-25 14:15:33', user: 'Senthil Murugan', action: 'REVOKE_ACCESS', target: 'ML Engineer from temp_user', status: 'success', duration: '95ms' },
  { id: 'l6', timestamp: '2026-03-25 14:10:00', user: 'Bharat Rao', action: 'RUN_QUERY', target: 'SELECT COUNT(*) FROM BANKING.GOLD.FACT_TRANSACTIONS', status: 'error', duration: '15200ms' },
  { id: 'l7', timestamp: '2026-03-25 14:05:22', user: 'System', action: 'MODEL_UPDATE', target: 'gemini-2.0-flash → v2', status: 'success', duration: '—' },
  { id: 'l8', timestamp: '2026-03-25 13:58:44', user: 'Dipak Mandlik', action: 'LOGIN', target: 'admin@pi-optimized.com', status: 'success', duration: '620ms' },
  { id: 'l9', timestamp: '2026-03-25 13:45:10', user: 'Chetan Thorat', action: 'CREATE_PROJECT', target: 'Customer 360', status: 'success', duration: '150ms' },
  { id: 'l10', timestamp: '2026-03-25 13:30:00', user: 'Omkar Wakchaure', action: 'RUN_QUERY', target: 'CREATE TABLE BANKING.SILVER.CUSTOMER_SUMMARY AS...', status: 'warning', duration: '4500ms' },
  { id: 'l11', timestamp: '2026-03-25 13:25:00', user: 'Rushikesh Joshi', action: 'RUN_QUERY', target: 'SELECT customer_id, SUM(revenue) FROM BANKING.GOLD', status: 'success', duration: '250ms' },
  { id: 'l12', timestamp: '2026-03-25 13:20:00', user: 'Senthil Murugan', action: 'CREATE_SKILL', target: 'Query Optimizer', status: 'success', duration: '95ms' },
];

const MOST_ACTIVE_USERS = [
  { name: 'Dipak Mandlik', queries: 156, lastActive: '2 min ago', avatar: 'DM' },
  { name: 'Chetan Thorat', queries: 142, lastActive: '5 min ago', avatar: 'CT' },
  { name: 'Omkar Wakchaure', queries: 128, lastActive: '12 min ago', avatar: 'OW' },
  { name: 'Rushikesh Joshi', queries: 115, lastActive: '18 min ago', avatar: 'RJ' },
  { name: 'Senthil Murugan', queries: 98, lastActive: '25 min ago', avatar: 'SM' },
  { name: 'Bharat Rao', queries: 87, lastActive: '32 min ago', avatar: 'BR' },
];

const MOCK_WAREHOUSES: WarehouseInfo[] = [
  { name: 'COMPUTE_WH', state: 'RUNNING', size: 'Medium', queries: 142, credits: 12.4 },
  { name: 'ANALYST_WH', state: 'RUNNING', size: 'Small', queries: 38, credits: 3.2 },
  { name: 'ML_WH', state: 'SUSPENDED', size: 'Large', queries: 5, credits: 8.7 },
];

const HOURLY_ACTIVITY = [
  { hour: '10:00', queries: 12, errors: 0 },
  { hour: '11:00', queries: 18, errors: 1 },
  { hour: '12:00', queries: 8, errors: 0 },
  { hour: '13:00', queries: 22, errors: 0 },
  { hour: '14:00', queries: 28, errors: 2 },
  { hour: '15:00', queries: 15, errors: 0 },
];

const SPARKLINE_ERRORS = [0, 1, 0, 0, 2, 0];
const SPARKLINE_DURATION = [120, 340, 85, 210, 95, 15200];

const statusDotColors: Record<string, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-[var(--color-text-main)] mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--color-text-muted)]">{entry.name}:</span>
          <span className="font-mono font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export function MonitoringView() {
  const { permissions, user } = useAuth();
  const isAdmin = permissions.viewAllMonitoring;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [timeRange, setTimeRange] = useState('24h');

  const logs = isAdmin
    ? MOCK_LOGS
    : MOCK_LOGS.filter((log) => log.user === user?.name || log.user === 'System');

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesStatus = filterStatus === 'all' || log.status === filterStatus;
    return matchesSearch && matchesAction && matchesStatus;
  });

  const uniqueActions = Array.from(new Set(MOCK_LOGS.map((l) => l.action)));
  const totalQueries = logs.filter((l) => l.action === 'RUN_QUERY').length;
  const errorCount = logs.filter((l) => l.status === 'error').length;
  const activeUsers = new Set(logs.map((l) => l.user)).size;
  const avgDuration = '890ms';

  const logColumns: Column<LogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      render: (val) => <span className="text-xs font-mono text-[var(--color-text-muted)] tabular-nums">{val as string}</span>,
    },
    ...(isAdmin ? [{
      key: 'user',
      header: 'User',
      sortable: true,
      render: (val: unknown) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-secondary)] flex items-center justify-center text-white text-[10px] font-bold">
            {(val as string).charAt(0)}
          </div>
          <span className="text-sm font-medium text-[var(--color-text-main)]">{val as string}</span>
        </div>
      ),
    }] : []),
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-[var(--color-surface)] text-[var(--color-text-main)]">
            {val as string}
          </span>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (val) => (
        <span className="text-xs font-mono text-[var(--color-text-muted)] truncate max-w-[200px] block" title={val as string}>
          {val as string}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (val) => (
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDotColors[val as string]}`} />
          <StatusBadge status={val as 'success' | 'error' | 'warning'} />
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (val, row) => {
        const ms = parseInt(val as string);
        const isSlow = ms > 5000;
        return (
          <div className="flex items-center justify-end gap-2">
            <span className={`text-xs font-mono tabular-nums ${isSlow ? 'text-red-500 font-medium' : 'text-[var(--color-text-muted)]'}`}>
              {val as string}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">
            {isAdmin ? 'System Monitoring' : 'My Activity'}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {isAdmin ? 'Usage metrics, audit logs, and warehouse status' : 'Your recent activity and query history'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-0.5">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-white text-[var(--color-text-main)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Metrics */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <MetricCard label="Total Queries" value={totalQueries} subtitle="In selected period" icon={<Database className="w-4 h-4" />} color="blue" delay={0} />
        <MetricCard label="Errors" value={errorCount} subtitle="Needs attention" icon={<AlertCircle className="w-4 h-4" />} color={errorCount > 0 ? 'rose' : 'emerald'} sparkline={SPARKLINE_ERRORS} delay={1} />
        {isAdmin && <MetricCard label="Active Users" value={activeUsers} subtitle="In selected period" icon={<Users className="w-4 h-4" />} color="emerald" delay={2} />}
        <MetricCard label="Avg Duration" value={avgDuration} subtitle="Query execution" icon={<Clock className="w-4 h-4" />} color="purple" delay={isAdmin ? 3 : 2} />
      </div>

      {/* Activity Chart (admin only) */}
      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card padding="none">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--color-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Query Activity</h3>
              </div>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={HOURLY_ACTIVITY} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="queries" name="Queries" fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                  <Bar dataKey="errors" name="Errors" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Warehouses (admin only) */}
      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card padding="none">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Warehouses</h3>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                {MOCK_WAREHOUSES.filter((w) => w.state === 'RUNNING').length}/{MOCK_WAREHOUSES.length} running
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-border)]">
              {MOCK_WAREHOUSES.map((wh, i) => (
                <motion.div
                  key={wh.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className="p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-[var(--color-text-main)]">{wh.name}</span>
                    <StatusBadge
                      status={wh.state === 'RUNNING' ? 'active' : wh.state === 'SUSPENDED' ? 'expired' : 'pending'}
                      label={wh.state}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mb-3">
                    <span>{wh.size}</span>
                    <span>·</span>
                    <span>{wh.queries} queries</span>
                    <span>·</span>
                    <span className="font-mono">{wh.credits} credits</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (wh.queries / 150) * 100)}%` }}
                      transition={{ delay: 0.4 + i * 0.1, duration: 0.6 }}
                      className={`h-full rounded-full ${wh.state === 'RUNNING' ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gray-300'}`}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
            </Card>
        </motion.div>
      )}

      {/* Most Active Users (admin only) */}
      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card padding="none">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Most Active Users</h3>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                {MOST_ACTIVE_USERS.length} users
              </span>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {MOST_ACTIVE_USERS.map((user, i) => (
                <motion.div
                  key={user.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.06 }}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[var(--color-surface)]/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {user.avatar}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-[var(--color-text-main)]">{user.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-[var(--color-text-muted)]">{user.queries} queries</span>
                        <span className="text-[11px] text-[var(--color-text-light)]">·</span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">Active {user.lastActive}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden w-20">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(user.queries / MOST_ACTIVE_USERS[0].queries) * 100}%` }}
                        transition={{ delay: 0.4 + i * 0.1, duration: 0.6 }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="all">All Actions</option>
          {uniqueActions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        {isAdmin && (
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-border-strong)] transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
      </div>

      {/* Logs Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <DataTable
          columns={logColumns}
          data={filteredLogs}
          emptyMessage="No logs match your filters"
          rowKey="id"
          compact
          paginated
          defaultPageSize={5}
          striped
        />
      </motion.div>

    </div>
  );
}
