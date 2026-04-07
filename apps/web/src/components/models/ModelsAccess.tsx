import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Search, Brain, Check, Lock, Unlock, Shield, Zap, Globe, Sparkles, Loader2, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { useAuth } from '../../auth';
import { Card, StatusBadge, EmptyState, Modal, Button } from '../common';
import { useToast } from '../common';
import { modelsApi, usersApi, type ModelRecord, type UserRecord } from '../../api/apiClient';

const TIER_CONFIG = {
  free: { label: 'Free', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: Globe },
  standard: { label: 'Standard', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Zap },
  premium: { label: 'Premium', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Sparkles },
};

const PROVIDER_ICONS: Record<string, string> = {
  google: '🟠',
  anthropic: '🟤',
  openai: '⚫',
  default: '🔷',
};

export function ModelsAccess() {
  const { user, token, permissions } = useAuth();
  const { toast } = useToast();
  const isAdmin = permissions.manageModels;

  const [models, setModels] = useState<ModelRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | 'free' | 'standard' | 'premium'>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelRecord | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await modelsApi.list(token);
      setModels(result.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchUsers = useCallback(async () => {
    try {
      const result = await usersApi.list(token);
      setUsers(result.users);
    } catch {
      // Ignore user fetch errors
    }
  }, [token]);

  useEffect(() => {
    fetchModels();
    if (isAdmin) {
      fetchUsers();
    }
  }, [fetchModels, fetchUsers, isAdmin]);

  const handleAssignModel = async () => {
    if (!selectedModel || !selectedUserId) return;
    try {
      await modelsApi.assign(token, selectedUserId, selectedModel.model_id);
      toast('success', `${selectedModel.display_name} assigned successfully`);
      setAssignModalOpen(false);
      setSelectedUserId('');
      fetchModels();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to assign model');
    }
  };

  const handleRevokeModel = async (userId: string, modelId: string) => {
    try {
      await modelsApi.revoke(token, userId, modelId);
      toast('success', 'Model access revoked');
      fetchModels();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to revoke model');
    }
  };

  const openAssignModal = (model: ModelRecord) => {
    setSelectedModel(model);
    setAssignModalOpen(true);
  };

  const providers = Array.from(new Set(models.map(m => m.provider)));

  const filteredModels = models.filter((m) => {
    const matchesSearch = m.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.model_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = filterTier === 'all' || m.tier === filterTier;
    const matchesProvider = filterProvider === 'all' || m.provider === filterProvider;
    return matchesSearch && matchesTier && matchesProvider;
  });

  const accessibleCount = models.filter((m) => m.access?.is_active).length;
  const totalCount = models.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">
            {isAdmin ? 'Model Access' : 'Available Models'}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {isAdmin ? 'Manage AI model access across your organization' : 'AI models available for your workspace'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg text-xs font-medium text-blue-700">
              <Brain className="w-3.5 h-3.5" />
              {accessibleCount}/{totalCount} assigned
            </div>
          )}
          <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'cards' ? 'bg-white text-[var(--color-text-main)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'table' ? 'bg-white text-[var(--color-text-main)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </motion.div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <span>{error}</span>
          <button onClick={fetchModels} className="ml-auto underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all"
          />
        </div>
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value as typeof filterTier)}
          className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="all">All Providers</option>
          {providers.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
          <span className="ml-2 text-sm text-[var(--color-text-muted)]">Loading models...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredModels.length === 0 && (
        <EmptyState
          icon={<Brain className="w-8 h-8" />}
          title="No models found"
          message="No AI models match your search or filter criteria."
        />
      )}

      {/* Cards View */}
      {!loading && viewMode === 'cards' && filteredModels.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredModels.map((model, i) => {
            const tier = TIER_CONFIG[model.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.standard;
            const TierIcon = tier.icon;
            const hasAccess = model.access?.is_active;

            return (
              <motion.div
                key={model.model_id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
              >
                <Card hover className="h-full flex flex-col group/card">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl ${tier.bg} flex items-center justify-center transition-transform group-hover/card:scale-110`}>
                      <Brain className={`w-5 h-5 ${tier.text}`} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${tier.bg} ${tier.text}`}>
                        <TierIcon className="w-3 h-3" />
                        {tier.label}
                      </span>
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-[var(--color-text-main)] mb-0.5">{model.display_name}</h4>
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
                    <span>{PROVIDER_ICONS[model.provider] || PROVIDER_ICONS.default}</span>
                    <span>{model.provider.charAt(0).toUpperCase() + model.provider.slice(1)}</span>
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono mb-4">{model.model_id}</p>

                  {/* Access controls */}
                  <div className="pt-3 border-t border-[var(--color-border)] mt-auto">
                    {isAdmin ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {hasAccess ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <Check className="w-3.5 h-3.5" />
                              Assigned
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                              <Lock className="w-3.5 h-3.5" />
                              Not Assigned
                            </span>
                          )}
                        </div>
                        {hasAccess ? (
                          <button
                            onClick={() => handleRevokeModel(model.access?.granted_at || '', model.model_id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
                          >
                            <Lock className="w-3 h-3" />
                            Revoke
                          </button>
                        ) : (
                          <button
                            onClick={() => openAssignModal(model)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            <UserPlus className="w-3 h-3" />
                            Assign
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {hasAccess ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Accessible in your workspace
                          </span>
                        ) : (
                          <span className="text-gray-500 flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" />
                            Contact admin for access
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {!loading && viewMode === 'table' && filteredModels.length > 0 && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Model</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Provider</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Tier</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Model ID</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
                  {isAdmin && (
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredModels.map((model, i) => {
                  const tier = TIER_CONFIG[model.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.standard;
                  const hasAccess = model.access?.is_active;

                  return (
                    <motion.tr
                      key={model.model_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-[var(--color-surface)]/50 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${tier.bg} flex items-center justify-center`}>
                            <Brain className={`w-4 h-4 ${tier.text}`} />
                          </div>
                          <span className="text-sm font-semibold text-[var(--color-text-main)]">{model.display_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-[var(--color-text-muted)]">
                          {model.provider.charAt(0).toUpperCase() + model.provider.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tier.bg} ${tier.text}`}>
                          {tier.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-mono text-[var(--color-text-muted)]">{model.model_id}</span>
                      </td>
                      <td className="px-5 py-4">
                        {hasAccess ? (
                          <StatusBadge status="active" label="Assigned" />
                        ) : (
                          <StatusBadge status="pending" label="Not Assigned" />
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4 text-right">
                          {hasAccess ? (
                            <button
                              onClick={() => handleRevokeModel(model.access?.granted_at || '', model.model_id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
                            >
                              <Lock className="w-3 h-3" />
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => openAssignModal(model)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                            >
                              <UserPlus className="w-3 h-3" />
                              Assign
                            </button>
                          )}
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Assign Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => { setAssignModalOpen(false); setSelectedUserId(''); }}
        title="Assign Model"
        subtitle={`Grant access to "${selectedModel?.display_name}" for a user`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAssignModalOpen(false); setSelectedUserId(''); }}>
              Cancel
            </Button>
            <Button onClick={handleAssignModel} disabled={!selectedUserId}>
              Assign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
              User
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Select a user...</option>
              {users.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.display_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
