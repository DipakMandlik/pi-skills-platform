import React, { useState } from 'react';
import { useStore } from '../../store';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mcpClient } from '../../api/mcpClient';

interface PlanNode {
  id: string;
  operation: string;
  details: string;
  children?: PlanNode[];
}

interface ExplainResult {
  plan: string;
  operations: Array<{ id: string; operation: string; details: string }>;
  query_id: string;
}

interface QueryProfile {
  query_id: string;
  query_text: string;
  status: string;
  execution_time_ms: number;
  bytes_scanned: number;
  rows_produced: number;
  partitions_scanned: number;
  partitions_total: number;
  error_code: string | null;
  error_message: string | null;
}

export function QueryPlanViewer() {
  const [query, setQuery] = useState('');
  const [planResult, setPlanResult] = useState<ExplainResult | null>(null);
  const [profileResult, setProfileResult] = useState<QueryProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'profile'>('plan');

  const handleExplain = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const result = await mcpClient.callTool<ExplainResult>({
        name: 'explain_query',
        arguments: { query: query.trim() },
      });

      if (result.ok && result.result) {
        setPlanResult(result.result);
        setActiveTab('plan');
      } else {
        setError('Failed to explain query');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to explain query');
    } finally {
      setLoading(false);
    }
  };

  const handleGetProfile = async () => {
    if (!planResult?.query_id) return;
    setLoading(true);
    setError(null);

    try {
      const result = await mcpClient.callTool<QueryProfile>({
        name: 'get_query_profile',
        arguments: { query_id: planResult.query_id },
      });

      if (result.ok && result.result) {
        setProfileResult(result.result);
        setActiveTab('profile');
      } else {
        setError('Failed to get query profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get query profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
             <Icons.GitBranch className="w-4 h-4 text-[var(--color-accent)]" />
            <span className="text-sm font-semibold text-gray-800">Query Plan</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExplain}
              disabled={loading || !query.trim()}
               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] disabled:opacity-30 transition-colors"
            >
              {loading ? <Icons.Loader2 className="w-3 h-3 animate-spin" /> : <Icons.Play className="w-3 h-3" />}
              Explain
            </button>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-b border-gray-200">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Enter SQL query to analyze..."
          rows={3}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 resize-none focus:outline-none focus:border-blue-400 placeholder:text-gray-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('plan')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'plan' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Execution Plan
        </button>
        <button
          onClick={() => { setActiveTab('profile'); handleGetProfile(); }}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'profile' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Runtime Profile
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 text-red-700 text-xs">
              <Icons.AlertCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}

        {activeTab === 'plan' && planResult && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">Operations</div>
            {planResult.operations.map((op, i) => (
              <div key={i}>
                <PlanOperation operation={op} />
              </div>
            ))}
            {planResult.operations.length === 0 && (
              <pre className="text-xs font-mono text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{planResult.plan}</pre>
            )}
          </div>
        )}

        {activeTab === 'profile' && profileResult && (
          <ProfileView profile={profileResult} />
        )}

        {!planResult && !profileResult && !error && (
          <div className="text-center py-8">
            <Icons.GitBranch className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Enter a query and click Explain to see the execution plan</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanOperation({ operation }: { operation: { id: string; operation: string; details: string } }) {
  const [expanded, setExpanded] = useState(false);

  const getOpColor = (op: string) => {
    if (op.includes('Scan') || op.includes('Table')) return 'text-blue-600 bg-blue-50';
    if (op.includes('Join')) return 'text-purple-600 bg-purple-50';
    if (op.includes('Aggregate') || op.includes('Group')) return 'text-emerald-600 bg-emerald-50';
    if (op.includes('Sort')) return 'text-amber-600 bg-amber-50';
    if (op.includes('Filter')) return 'text-cyan-600 bg-cyan-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-gray-300 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Icons.ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getOpColor(operation.operation)}`}>
          {operation.operation || 'Operation'}
        </span>
        {operation.id && (
          <span className="text-[10px] font-mono text-gray-400">#{operation.id}</span>
        )}
      </div>
      {expanded && operation.details && (
        <div className="px-3 pb-2 border-t border-gray-100">
          <pre className="text-xs font-mono text-gray-600 mt-2 whitespace-pre-wrap">{operation.details}</pre>
        </div>
      )}
    </div>
  );
}

function ProfileView({ profile }: { profile: QueryProfile }) {
  const formatBytes = (bytes: number) => {
    if (bytes > 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
    if (bytes > 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatTime = (ms: number) => {
    if (ms > 60000) return `${(ms / 60000).toFixed(1)} min`;
    if (ms > 1000) return `${(ms / 1000).toFixed(2)} s`;
    return `${ms.toFixed(0)} ms`;
  };

  const partitionPct = profile.partitions_total > 0
    ? Math.round(profile.partitions_scanned / profile.partitions_total * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${profile.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span className="text-xs font-medium text-gray-700">{profile.status}</span>
        <span className="text-[10px] font-mono text-gray-400 ml-auto">{profile.query_id}</span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Execution Time" value={formatTime(profile.execution_time_ms)} icon={Icons.Clock} />
        <MetricCard label="Bytes Scanned" value={formatBytes(profile.bytes_scanned)} icon={Icons.Database} />
        <MetricCard label="Rows Produced" value={profile.rows_produced.toLocaleString()} icon={Icons.Table2} />
        <MetricCard label="Partitions" value={`${profile.partitions_scanned}/${profile.partitions_total} (${partitionPct}%)`} icon={Icons.Layers} />
      </div>

      {/* Query Text */}
      {profile.query_text && (
        <div>
          <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">Query</div>
          <pre className="text-xs font-mono text-gray-600 bg-gray-50 p-2 rounded-lg overflow-x-auto">{profile.query_text}</pre>
        </div>
      )}

      {/* Error */}
      {profile.error_code && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-xs font-mono text-red-700">{profile.error_code}</div>
          {profile.error_message && (
            <div className="text-xs text-red-600 mt-1">{profile.error_message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-gray-400" />
        <span className="text-[10px] font-mono text-gray-400 uppercase">{label}</span>
      </div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}
