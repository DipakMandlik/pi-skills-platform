import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { X, Activity, Database, Clock, Zap, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { mcpClient } from '../api/mcpClient';

interface WarehouseInfo {
  name: string;
  state: string;
  size: string;
  type: string;
}

interface HealthData {
  status: string;
  sql_safety_mode: string;
  missing_env: string[];
  snowflake_connector_ready: boolean;
}

function StatCard({ title, value, sub, icon: Icon, color }: { title: string; value: string; sub?: string; icon: any; color: string }) {
  const colorMap: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'metric-icon-bg-blue', icon: 'metric-icon-blue' },
    green: { bg: 'metric-icon-bg-emerald', icon: 'metric-icon-emerald' },
    amber: { bg: 'metric-icon-bg-amber', icon: 'metric-icon-amber' },
    red: { bg: 'metric-icon-bg-rose', icon: 'metric-icon-rose' },
    purple: { bg: 'metric-icon-bg-purple', icon: 'metric-icon-purple' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">{title}</span>
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
      <div className="text-2xl font-bold text-[var(--color-foreground)]">{value}</div>
      {sub && <div className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function SystemMonitorModal() {
  const { isMonitorOpen, setIsMonitorOpen, mcpServerStatus } = useStore();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (mcpServerStatus !== 'ok') return;
    setLoading(true);
    setError(null);

    try {
      const [healthRes, warehousesRes] = await Promise.all([
        mcpClient.getHealth(),
        mcpClient.callTool<{ warehouses: any[] }>({ name: 'list_warehouses' }),
      ]);

      setHealth(healthRes as HealthData);
      setWarehouses((warehousesRes.result?.warehouses || []) as WarehouseInfo[]);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [mcpServerStatus]);

  useEffect(() => {
    if (isMonitorOpen) {
      fetchData();
    }
  }, [isMonitorOpen, fetchData]);

  if (!isMonitorOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsMonitorOpen(false)}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-[var(--color-surface-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl metric-icon-bg-blue flex items-center justify-center">
                <Activity className="w-5 h-5 metric-icon-blue" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-foreground)]">System Monitor</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${
                    mcpServerStatus === 'ok' ? 'bg-emerald-500' :
                    mcpServerStatus === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    MCP: {mcpServerStatus} {lastRefresh ? `· Updated ${lastRefresh.toLocaleTimeString()}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors duration-150 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsMonitorOpen(false)}
                className="p-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="status-bg-red border border-[var(--color-border)] rounded-xl p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {mcpServerStatus !== 'ok' ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                <h3 className="font-semibold text-[var(--color-foreground)] mb-1">MCP Server Disconnected</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">Start the MCP server to see real-time Snowflake data</p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard
                    title="Warehouses"
                    value={String(warehouses.length)}
                    sub={warehouses.filter(w => w.state === 'RUNNING').length + ' running'}
                    icon={Database}
                    color="blue"
                  />
                  <StatCard
                    title="Connection"
                    value={health?.snowflake_connector_ready ? 'Connected' : 'Disconnected'}
                    sub={health?.sql_safety_mode || 'unknown'}
                    icon={health?.snowflake_connector_ready ? CheckCircle2 : AlertCircle}
                    color={health?.snowflake_connector_ready ? 'green' : 'amber'}
                  />
                  <StatCard
                    title="Safety Mode"
                    value={health?.sql_safety_mode || 'unknown'}
                    icon={Zap}
                    color="purple"
                  />
                  <StatCard
                    title="Status"
                    value={health?.status || 'unknown'}
                    icon={Clock}
                    color="blue"
                  />
                </div>

                {/* Warehouses Table */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--color-border)]">
                    <h3 className="text-sm font-medium text-[var(--color-foreground)]">Warehouses</h3>
                  </div>
                  {warehouses.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="bg-[var(--color-surface)]/80">
                          <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">Name</th>
                          <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">State</th>
                          <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">Size</th>
                          <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warehouses.map((wh, i) => (
                          <tr key={i} className="border-t border-[var(--color-border)]">
                            <td className="px-4 py-2.5 text-sm font-medium text-[var(--color-foreground)]">{wh.name}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-mono px-2 py-0.5 rounded-md ${
                                wh.state === 'RUNNING' ? 'status-bg-emerald' :
                                wh.state === 'SUSPENDED' ? 'bg-[var(--color-surface)] text-[var(--color-muted-foreground)]' :
                                'status-bg-amber'
                              }`}>
                                {wh.state}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-[var(--color-muted-foreground)] font-mono">{wh.size || '—'}</td>
                            <td className="px-4 py-2.5 text-sm text-[var(--color-muted-foreground)]">{wh.type || 'STANDARD'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
                      {loading ? 'Loading warehouses...' : 'No warehouses found'}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
