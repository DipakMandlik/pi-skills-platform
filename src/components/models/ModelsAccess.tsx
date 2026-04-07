import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, Brain, Check, Lock, Unlock, Zap, Globe, Sparkles, RefreshCw, AlertCircle, Plus, SlidersHorizontal, ShieldCheck, Link2, Trash2, Pencil, Cpu } from 'lucide-react';
import { useAuth } from '../../auth';
import { Card, StatusBadge, EmptyState, Skeleton, Button, Modal } from '../common';
import { useToast } from '../ui';
import { adminApi, governanceApi } from '../../services/governanceApi';
import {
  assignModel,
  createModelConfiguration,
  createSecretReference,
  fetchTeamAccess,
  fetchTeams,
  fetchUsers,
  deleteModelConfiguration,
  listModelConfigurations,
  listSecretReferences,
  revokeModel,
  updateTeamAccess,
  updateModelConfiguration,
  validateModelConfiguration,
  type ModelConfigurationItem,
  type SecretReferenceItem,
  type TeamAccessConfig,
  type TeamItem,
  type UserItem,
  fetchModels,
  type ModelItem,
} from '../../services/backendApi';
import { getUserFacingError } from '../../services/errorUtils';

interface ModelInfo {
  modelId: string;
  modelName: string;
  provider: string;
  description: string;
  tier: 'free' | 'standard' | 'premium';
  userAccess: boolean;
  contextWindow: string;
  speed: 'fast' | 'medium' | 'slow';
  maxTokens: number;
  rateLimit: number;
}

type Tier = 'free' | 'standard' | 'premium';
type Speed = 'fast' | 'medium' | 'slow';

interface ModelCatalogItem {
  model_id: string;
  display_name: string;
  provider: string;
  tier: Tier;
  description: string;
  contextWindow: string;
  speed: Speed;
  maxTokens: number;
  rateLimit: number;
}

interface CostProfile {
  promptPer1k: number;
  completionPer1k: number;
  estimatedMonthlyTokens: number;
  estimatedMonthlyCost: number;
}

function getModelCostProfile(model: ModelInfo): CostProfile {
  const base = model.tier === 'premium'
    ? { promptPer1k: 0.01, completionPer1k: 0.03 }
    : model.tier === 'standard'
      ? { promptPer1k: 0.003, completionPer1k: 0.009 }
      : { promptPer1k: 0.0008, completionPer1k: 0.0024 };
  const promptFactor = 0.65;
  const completionFactor = 0.35;
  const estimatedMonthlyTokens = Math.max(12_000, Math.round(model.rateLimit * model.maxTokens * 0.25));
  const weightedPer1k = base.promptPer1k * promptFactor + base.completionPer1k * completionFactor;
  const estimatedMonthlyCost = Number(((estimatedMonthlyTokens / 1000) * weightedPer1k).toFixed(2));
  return { ...base, estimatedMonthlyTokens, estimatedMonthlyCost };
}

const MODEL_CATALOG: ModelCatalogItem[] = [
  { model_id: 'gpt-4o', display_name: 'GPT-4o', provider: 'openai', tier: 'premium', description: 'Flagship multimodal model with strong reasoning and broad task quality.', contextWindow: '128K', speed: 'medium', maxTokens: 8192, rateLimit: 180 },
  { model_id: 'claude-3-opus', display_name: 'Claude 3 Opus', provider: 'anthropic', tier: 'premium', description: 'High-intelligence model for deep analysis and complex workflows.', contextWindow: '200K', speed: 'slow', maxTokens: 8192, rateLimit: 120 },
  { model_id: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', provider: 'google', tier: 'premium', description: 'High-quality Gemini model for complex multi-step reasoning.', contextWindow: '2M', speed: 'medium', maxTokens: 8192, rateLimit: 180 },
  { model_id: 'claude-3.5-sonnet', display_name: 'Claude 3.5 Sonnet', provider: 'anthropic', tier: 'premium', description: 'Best-default balanced model for quality, coding, and speed.', contextWindow: '200K', speed: 'medium', maxTokens: 8192, rateLimit: 180 },
  { model_id: 'gpt-4-turbo', display_name: 'GPT-4 Turbo', provider: 'openai', tier: 'premium', description: 'Balanced high-performance GPT model for production use.', contextWindow: '128K', speed: 'medium', maxTokens: 8192, rateLimit: 180 },
  { model_id: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash', provider: 'google', tier: 'standard', description: 'Fast, balanced Gemini model for general workloads.', contextWindow: '1M', speed: 'fast', maxTokens: 4096, rateLimit: 220 },
  { model_id: 'claude-3-haiku', display_name: 'Claude 3 Haiku', provider: 'anthropic', tier: 'standard', description: 'Fast and cost-efficient Anthropic model for lightweight tasks.', contextWindow: '200K', speed: 'fast', maxTokens: 4096, rateLimit: 240 },
  { model_id: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', provider: 'openai', tier: 'standard', description: 'Low-cost and high-throughput default model for simple workloads.', contextWindow: '16K', speed: 'fast', maxTokens: 4096, rateLimit: 260 },
  { model_id: 'llama-3-8b', display_name: 'LLaMA 3 (8B)', provider: 'meta', tier: 'free', description: 'Open-source compact LLaMA model for private deployments.', contextWindow: '8K', speed: 'fast', maxTokens: 4096, rateLimit: 200 },
  { model_id: 'llama-3-70b', display_name: 'LLaMA 3 (70B)', provider: 'meta', tier: 'standard', description: 'Larger open-source LLaMA model with stronger reasoning.', contextWindow: '8K', speed: 'medium', maxTokens: 4096, rateLimit: 140 },
  { model_id: 'llama-3.1', display_name: 'LLaMA 3.1', provider: 'meta', tier: 'standard', description: 'Newer generation LLaMA model for custom enterprise hosting.', contextWindow: '128K', speed: 'medium', maxTokens: 8192, rateLimit: 150 },
  { model_id: 'mixtral-8x7b', display_name: 'Mixtral 8x7B', provider: 'mistral', tier: 'standard', description: 'Sparse mixture model with strong quality-to-cost ratio.', contextWindow: '32K', speed: 'medium', maxTokens: 4096, rateLimit: 170 },
  { model_id: 'mistral-7b', display_name: 'Mistral 7B', provider: 'mistral', tier: 'free', description: 'Lightweight open model for efficient and private inference.', contextWindow: '32K', speed: 'fast', maxTokens: 4096, rateLimit: 220 },
  { model_id: 'cohere-command-r', display_name: 'Cohere Command R', provider: 'cohere', tier: 'standard', description: 'Enterprise model tuned for retrieval-augmented responses.', contextWindow: '128K', speed: 'medium', maxTokens: 4096, rateLimit: 180 },
  { model_id: 'cohere-command-r-plus', display_name: 'Cohere Command R+', provider: 'cohere', tier: 'premium', description: 'High-capability enterprise model for advanced RAG workloads.', contextWindow: '128K', speed: 'medium', maxTokens: 8192, rateLimit: 160 },
  { model_id: 'cohere-embed', display_name: 'Cohere Embed', provider: 'cohere', tier: 'standard', description: 'Embedding model for semantic search and vector retrieval.', contextWindow: 'N/A', speed: 'fast', maxTokens: 2048, rateLimit: 260 },
  { model_id: 'deepseek-coder', display_name: 'DeepSeek Coder', provider: 'deepseek', tier: 'standard', description: 'Code-specialized model for generation, refactor, and debugging.', contextWindow: '32K', speed: 'medium', maxTokens: 8192, rateLimit: 180 },
  { model_id: 'grok-1.5', display_name: 'Grok-1.5', provider: 'xai', tier: 'premium', description: 'Experimental frontier model for broad reasoning tasks.', contextWindow: '128K', speed: 'medium', maxTokens: 8192, rateLimit: 160 },
  { model_id: 'deepseek-llm', display_name: 'DeepSeek LLM', provider: 'deepseek', tier: 'standard', description: 'General-purpose DeepSeek model for scalable workloads.', contextWindow: '32K', speed: 'medium', maxTokens: 4096, rateLimit: 190 },
  { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', provider: 'google', tier: 'free', description: 'Fast Gemini variant optimized for low-latency interactions.', contextWindow: '1M', speed: 'fast', maxTokens: 4096, rateLimit: 220 },
  { model_id: 'gpt-4o-mini', display_name: 'GPT-4o Mini', provider: 'openai', tier: 'standard', description: 'Compact GPT-4o model for lower cost and faster responses.', contextWindow: '128K', speed: 'fast', maxTokens: 4096, rateLimit: 240 },
  { model_id: 'gpt-4.1', display_name: 'GPT-4.1', provider: 'openai', tier: 'premium', description: 'High-capability GPT model with strong reasoning and coding.', contextWindow: '1M', speed: 'medium', maxTokens: 8192, rateLimit: 180 },
  { model_id: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini', provider: 'openai', tier: 'standard', description: 'Smaller GPT-4.1 variant for balanced speed and quality.', contextWindow: '1M', speed: 'fast', maxTokens: 4096, rateLimit: 230 },
  { model_id: 'o3-mini', display_name: 'o3 Mini', provider: 'openai', tier: 'premium', description: 'Reasoning-focused OpenAI model for complex analytical tasks.', contextWindow: '200K', speed: 'slow', maxTokens: 8192, rateLimit: 130 },
];

const MODEL_METADATA: Record<string, {
  provider: string;
  description: string;
  tier: Tier;
  contextWindow: string;
  speed: Speed;
  maxTokens: number;
  rateLimit: number;
}> = MODEL_CATALOG.reduce((acc, model) => {
  acc[model.model_id] = {
    provider: model.provider,
    description: model.description,
    tier: model.tier,
    contextWindow: model.contextWindow,
    speed: model.speed,
    maxTokens: model.maxTokens,
    rateLimit: model.rateLimit,
  };
  return acc;
}, {} as Record<string, {
  provider: string;
  description: string;
  tier: Tier;
  contextWindow: string;
  speed: Speed;
  maxTokens: number;
  rateLimit: number;
}>);

function normalizeTier(value: string | undefined): Tier {
  const lowered = (value || '').toLowerCase();
  if (lowered === 'free' || lowered === 'standard' || lowered === 'premium') return lowered;
  return 'standard';
};

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const tierConfig = {
  free: {
    label: 'Free',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    iconWrap: 'bg-emerald-50/90 border-emerald-200/70 text-emerald-600 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-900/35 dark:text-emerald-300 dark:border-emerald-800',
    glow: 'from-emerald-100/80 via-emerald-50/35 to-transparent',
    icon: Globe,
  },
  standard: {
    label: 'Standard',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    iconWrap: 'bg-blue-50/90 border-blue-200/70 text-blue-600 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-400',
    badge: 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200/80 shadow-[0_0_16px_rgba(59,130,246,0.12)] dark:from-blue-900/40 dark:to-indigo-900/35 dark:text-blue-300 dark:border-blue-800',
    glow: 'from-blue-100/80 via-indigo-50/35 to-transparent',
    icon: Zap,
  },
  premium: {
    label: 'Premium',
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
    iconWrap: 'bg-purple-50/90 border-purple-200/70 text-purple-600 dark:bg-purple-900/40 dark:border-purple-800 dark:text-purple-400',
    badge: 'bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 border-purple-200/80 shadow-[0_0_18px_rgba(139,92,246,0.16)] dark:from-purple-900/40 dark:to-indigo-900/35 dark:text-purple-300 dark:border-purple-800',
    glow: 'from-purple-100/80 via-indigo-50/35 to-transparent',
    icon: Sparkles,
  },
};

const speedBadge = {
  fast: {
    label: 'Fast',
    color: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-50/80 border-emerald-200/70 dark:bg-emerald-900/30 dark:border-emerald-800',
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-600 dark:text-amber-400',
    chip: 'bg-amber-50/80 border-amber-200/70 dark:bg-amber-900/30 dark:border-amber-800',
  },
  slow: {
    label: 'Deliberate',
    color: 'text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-50/80 border-blue-200/70 dark:bg-blue-900/30 dark:border-blue-800',
  },
};

const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const MAX_TOKENS_MIN = 1;
const MAX_TOKENS_MAX = 100000;
const MAX_TOKENS_SOFT_WARNING = 32768;
const MAX_TOKENS_STRONG_WARNING = 65536;
const TIMEOUT_MIN = 1;
const TIMEOUT_MAX = 300;
const SNOWFLAKE_ADMIN_ACCESS_ROLES = ['ACCOUNTADMIN', 'ORG_ADMIN', 'SYSADMIN', 'SECURITYADMIN', 'SECURITY_ADMIN'] as const;

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function mapToModelInfo(item: ModelItem): ModelInfo {
  const meta = MODEL_METADATA[item.model_id] || {
    provider: item.provider || 'Unknown',
    description: item.display_name || item.model_id,
    tier: normalizeTier(item.tier),
    contextWindow: '-',
    speed: 'medium' as const,
    maxTokens: 4096,
    rateLimit: 100,
  };
  return {
    modelId: item.model_id,
    modelName: item.display_name || item.model_id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    provider: item.provider || meta.provider,
    description: meta.description,
    tier: normalizeTier(item.tier) || meta.tier,
    userAccess: item.is_available,
    contextWindow: meta.contextWindow,
    speed: meta.speed,
    maxTokens: meta.maxTokens,
    rateLimit: meta.rateLimit,
  };
}

function catalogToModelItem(model: ModelCatalogItem): ModelItem {
  return {
    model_id: model.model_id,
    display_name: model.display_name,
    provider: model.provider,
    tier: model.tier,
    is_available: false,
    access: null,
  };
}

export function ModelsAccess() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'SECURITY_ADMIN', 'SECURITYADMIN'].some(r => hasRole(r));

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | 'free' | 'standard' | 'premium'>('all');
  const [toggling, setToggling] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [validatingConfigId, setValidatingConfigId] = useState<string | null>(null);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestModelId, setRequestModelId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestingModel, setRequestingModel] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selectedModelForAccess, setSelectedModelForAccess] = useState<ModelInfo | null>(null);
  const [assignmentUsers, setAssignmentUsers] = useState<string[]>([]);
  const [assignmentTeams, setAssignmentTeams] = useState<string[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [teamAccessMap, setTeamAccessMap] = useState<Record<string, TeamAccessConfig>>({});

  const [configs, setConfigs] = useState<ModelConfigurationItem[]>([]);
  const [secrets, setSecrets] = useState<SecretReferenceItem[]>([]);

  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ModelConfigurationItem | null>(null);
  const [configTouched, setConfigTouched] = useState<Record<string, boolean>>({});
  const [configSubmitAttempted, setConfigSubmitAttempted] = useState(false);

  const [secretForm, setSecretForm] = useState({
    reference_key: '',
    provider: '',
    secret_value: '',
  });

  const [configForm, setConfigForm] = useState({
    model_id: '',
    provider: '',
    base_url: '',
    secret_reference_key: '',
    temperature: '0.2',
    max_tokens: '2048',
    request_timeout_seconds: '30',
    parameters: '{}',
    is_active: true,
  });

  const resetSecretForm = () => {
    setSecretForm({ reference_key: '', provider: '', secret_value: '' });
  };

  const resetConfigForm = () => {
    setConfigForm({
      model_id: '',
      provider: '',
      base_url: '',
      secret_reference_key: '',
      temperature: '0.2',
      max_tokens: '2048',
      request_timeout_seconds: '30',
      parameters: '{}',
      is_active: true,
    });
  };

  const markTouched = (field: string) => {
    setConfigTouched((prev) => ({ ...prev, [field]: true }));
  };

  const loadAdminConfig = async () => {
    if (!isAdmin) return;
    try {
      const [secretRows, configRows] = await Promise.all([
        listSecretReferences(),
        listModelConfigurations(),
      ]);
      setSecrets(secretRows);
      setConfigs(configRows);
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to load model configuration data'));
    }
  };

  const loadAssignmentData = async () => {
    if (!isAdmin) return;
    setLoadingAssignments(true);
    try {
      const [userRows, teamRows] = await Promise.all([fetchUsers(), fetchTeams()]);
      const accessRows = await Promise.all(
        teamRows.map(async (team) => {
          try {
            return await fetchTeamAccess(team.team_id);
          } catch {
            return { team_id: team.team_id, user_ids: [], skill_ids: [], model_ids: [] } as TeamAccessConfig;
          }
        }),
      );
      const byTeam = accessRows.reduce((acc, access) => {
        acc[access.team_id] = access;
        return acc;
      }, {} as Record<string, TeamAccessConfig>);
      setUsers(userRows);
      setTeams(teamRows);
      setTeamAccessMap(byTeam);
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to load assignment options'));
    } finally {
      setLoadingAssignments(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchModels();
      const merged = new Map<string, ModelItem>();

      MODEL_CATALOG.forEach((catalogModel) => {
        merged.set(catalogModel.model_id, catalogToModelItem(catalogModel));
      });

      items.forEach((apiModel) => {
        merged.set(apiModel.model_id, {
          ...apiModel,
          display_name: apiModel.display_name || merged.get(apiModel.model_id)?.display_name || apiModel.model_id,
          provider: apiModel.provider || merged.get(apiModel.model_id)?.provider || 'unknown',
          tier: apiModel.tier || merged.get(apiModel.model_id)?.tier || 'standard',
          is_available: apiModel.is_available,
        });
      });

      setModels(Array.from(merged.values()).map(mapToModelInfo));
      await loadAdminConfig();
    } catch (err) {
      // Keep the page usable when the backend is temporarily unavailable.
      const fallbackModels = MODEL_CATALOG
        .map(catalogToModelItem)
        .map(mapToModelInfo);
      setModels(fallbackModels);
      setError(null);
      toast('warning', getUserFacingError(err, 'Live model service unavailable. Showing catalog defaults.'));
      await loadAdminConfig();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!configModalOpen && !editingConfig) {
      resetConfigForm();
    }
  }, [configModalOpen, editingConfig]);

  const openCreateConfigModal = () => {
    setEditingConfig(null);
    resetConfigForm();
    setConfigTouched({});
    setConfigSubmitAttempted(false);
    setConfigModalOpen(true);
  };

  const openEditConfigModal = (row: ModelConfigurationItem) => {
    setEditingConfig(row);
    setConfigTouched({});
    setConfigSubmitAttempted(false);
    setConfigForm({
      model_id: row.model_id,
      provider: row.provider,
      base_url: row.base_url,
      secret_reference_key: row.secret_reference_key,
      temperature: String(row.temperature),
      max_tokens: String(row.max_tokens),
      request_timeout_seconds: String(row.request_timeout_seconds),
      parameters: JSON.stringify(row.parameters || {}, null, 2),
      is_active: row.is_active,
    });
    setConfigModalOpen(true);
  };

  const handleCreateSecret = async () => {
    if (!secretForm.reference_key.trim() || !secretForm.provider.trim() || !secretForm.secret_value.trim()) {
      toast('warning', 'Reference key, provider, and secret value are required.');
      return;
    }

    setSavingSecret(true);
    try {
      await createSecretReference({
        reference_key: secretForm.reference_key.trim(),
        provider: secretForm.provider.trim(),
        secret_value: secretForm.secret_value,
      });
      toast('success', 'Secret reference saved.');
      setSecretModalOpen(false);
      resetSecretForm();
      await loadAdminConfig();
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to save secret reference'));
    } finally {
      setSavingSecret(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigSubmitAttempted(true);
    if (!isConfigFormValid) {
      const firstError = Object.values(configValidationErrors).find((msg) => Boolean(msg));
      toast('warning', firstError || 'Please fix invalid configuration values.');
      return;
    }

    let parsedParameters: Record<string, unknown> = {};
    if (configForm.parameters.trim()) {
      try {
        parsedParameters = JSON.parse(configForm.parameters);
      } catch {
        toast('warning', 'Parameters must be valid JSON.');
        return;
      }
    }

    const payload = {
      model_id: configForm.model_id.trim(),
      provider: configForm.provider.trim(),
      base_url: configForm.base_url.trim(),
      secret_reference_key: configForm.secret_reference_key.trim(),
      temperature: Number(configForm.temperature),
      max_tokens: Number(configForm.max_tokens),
      request_timeout_seconds: Number(configForm.request_timeout_seconds),
      parameters: parsedParameters,
    };

    setSavingConfig(true);
    try {
      if (editingConfig) {
        await updateModelConfiguration(editingConfig.id, {
          base_url: payload.base_url,
          secret_reference_key: payload.secret_reference_key,
          temperature: payload.temperature,
          max_tokens: payload.max_tokens,
          request_timeout_seconds: payload.request_timeout_seconds,
          parameters: payload.parameters,
          is_active: configForm.is_active,
        });
        toast('success', 'Model configuration updated.');
      } else {
        await createModelConfiguration(payload);
        toast('success', 'Model configuration created.');
      }
      setConfigModalOpen(false);
      setEditingConfig(null);
      resetConfigForm();
      await loadAdminConfig();
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to save model configuration'));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRequestModelAccess = async () => {
    if (!requestModelId.trim()) {
      toast('warning', 'Model ID is required');
      return;
    }
    setRequestingModel(true);
    try {
      await governanceApi.createAccessRequest({
        resource_type: 'MODEL',
        resource_id: requestModelId.trim(),
        reason: requestReason.trim() || undefined,
      });
      toast('success', 'Access request submitted');
      setRequestModalOpen(false);
      setRequestModelId('');
      setRequestReason('');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setRequestingModel(false);
    }
  };

  const handleValidateConfig = async (cfg: ModelConfigurationItem) => {
    setValidatingConfigId(cfg.id);
    try {
      const result = await validateModelConfiguration({
        provider: cfg.provider,
        base_url: cfg.base_url,
        secret_reference_key: cfg.secret_reference_key,
      });
      toast(result.valid ? 'success' : 'warning', `${cfg.model_id}: ${result.message}`);
    } catch (err) {
      toast('error', getUserFacingError(err, 'Connectivity validation failed'));
    } finally {
      setValidatingConfigId(null);
    }
  };

  const handleDeleteConfig = async (cfg: ModelConfigurationItem) => {
    setDeletingConfigId(cfg.id);
    try {
      await deleteModelConfiguration(cfg.id);
      toast('success', `${cfg.model_id} configuration deleted.`);
      await loadAdminConfig();
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to delete configuration'));
    } finally {
      setDeletingConfigId(null);
    }
  };

  const filteredModels = models.filter((m) => {
    const matchesSearch = m.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.provider.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = filterTier === 'all' || m.tier === filterTier;
    return matchesSearch && matchesTier;
  });

  const visibleModels = isAdmin ? filteredModels : filteredModels.filter((m) => m.userAccess);

  const parsedTemperature = Number(configForm.temperature);
  const parsedMaxTokens = Number(configForm.max_tokens);
  const parsedTimeout = Number(configForm.request_timeout_seconds);

  const configValidationErrors = {
    model_id: configForm.model_id.trim() ? '' : 'Model ID is required.',
    provider: configForm.provider.trim() ? '' : 'Provider is required.',
    base_url: configForm.base_url.trim()
      ? (isValidHttpUrl(configForm.base_url) ? '' : 'Base URL must be a valid http/https URL.')
      : 'Base URL is required.',
    secret_reference_key: configForm.secret_reference_key.trim() ? '' : 'Secret reference key is required.',
    temperature:
      Number.isFinite(parsedTemperature) && parsedTemperature >= TEMPERATURE_MIN && parsedTemperature <= TEMPERATURE_MAX
        ? ''
        : `Temperature must be between ${TEMPERATURE_MIN} and ${TEMPERATURE_MAX}.`,
    max_tokens:
      Number.isInteger(parsedMaxTokens) && parsedMaxTokens >= MAX_TOKENS_MIN && parsedMaxTokens <= MAX_TOKENS_MAX
        ? ''
        : `Max tokens must be an integer between ${MAX_TOKENS_MIN} and ${MAX_TOKENS_MAX}.`,
    request_timeout_seconds:
      Number.isInteger(parsedTimeout) && parsedTimeout >= TIMEOUT_MIN && parsedTimeout <= TIMEOUT_MAX
        ? ''
        : `Timeout must be an integer between ${TIMEOUT_MIN} and ${TIMEOUT_MAX} seconds.`,
    parameters: (() => {
      if (!configForm.parameters.trim()) return '';
      try {
        JSON.parse(configForm.parameters);
        return '';
      } catch {
        return 'Parameters must be valid JSON.';
      }
    })(),
  };

  const isConfigFormValid = Object.values(configValidationErrors).every((value) => !value);
  const shouldShowError = (field: string) => Boolean(configValidationErrors[field as keyof typeof configValidationErrors])
    && (configTouched[field] || configSubmitAttempted);
  const inputBaseClass = 'w-full px-3.5 py-2.5 bg-[var(--color-surface)]/70 border rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] transition-all duration-200';
  const showHighTokenSoftWarning =
    Number.isInteger(parsedMaxTokens)
    && parsedMaxTokens > MAX_TOKENS_SOFT_WARNING
    && parsedMaxTokens <= MAX_TOKENS_MAX;
  const showVeryHighTokenSoftWarning =
    Number.isInteger(parsedMaxTokens)
    && parsedMaxTokens > MAX_TOKENS_STRONG_WARNING
    && parsedMaxTokens <= MAX_TOKENS_MAX;

  const toggleUserAccess = async (modelId: string) => {
    setToggling(modelId);
    const model = models.find((m) => m.modelId === modelId);
    if (!model) return;
    try {
      await adminApi.setModelAccess({
        model_id: modelId,
        enabled: !model.userAccess,
        allowed_roles: model.userAccess ? [...SNOWFLAKE_ADMIN_ACCESS_ROLES] : ['ALL'],
        max_tokens_per_request: model.maxTokens,
        rate_limit_per_minute: model.rateLimit,
      });
      setModels(models.map((m) => m.modelId === modelId ? { ...m, userAccess: !m.userAccess } : m));
      toast('success', `${model.modelName} user access ${model.userAccess ? 'revoked' : 'granted'}`);
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to update access'));
    } finally {
      setToggling(null);
    }
  };

  const openAssignAccessModal = async (model: ModelInfo) => {
    setSelectedModelForAccess(model);
    setAssignmentModalOpen(true);
    if (users.length === 0 || teams.length === 0) {
      await loadAssignmentData();
    }
  };

  useEffect(() => {
    if (!assignmentModalOpen || !selectedModelForAccess) return;
    const selectedModelId = selectedModelForAccess.modelId;
    const userSelections = users
      .filter((user) => user.allowed_models.includes(selectedModelId))
      .map((user) => user.user_id);
    const teamSelections = teams
      .filter((team) => (teamAccessMap[team.team_id]?.model_ids || []).includes(selectedModelId))
      .map((team) => team.team_id);
    setAssignmentUsers(userSelections);
    setAssignmentTeams(teamSelections);
  }, [assignmentModalOpen, selectedModelForAccess, users, teams, teamAccessMap]);

  const saveModelAssignments = async () => {
    if (!selectedModelForAccess) return;
    const modelId = selectedModelForAccess.modelId;
    setSavingAssignments(true);
    try {
      const previousUserIds = users
        .filter((user) => user.allowed_models.includes(modelId))
        .map((user) => user.user_id);
      const previousUserSet = new Set(previousUserIds);
      const nextUserSet = new Set(assignmentUsers);

      const userOps: Array<Promise<unknown>> = [];
      assignmentUsers.forEach((userId) => {
        if (!previousUserSet.has(userId)) userOps.push(assignModel(userId, modelId));
      });
      previousUserIds.forEach((userId) => {
        if (!nextUserSet.has(userId)) userOps.push(revokeModel(userId, modelId));
      });

      const teamOps = teams.map(async (team) => {
        const current = teamAccessMap[team.team_id] || { team_id: team.team_id, user_ids: [], skill_ids: [], model_ids: [] };
        const currentlyAssigned = current.model_ids.includes(modelId);
        const shouldAssign = assignmentTeams.includes(team.team_id);
        if (currentlyAssigned === shouldAssign) return null;
        const nextModelIds = shouldAssign
          ? [...new Set([...current.model_ids, modelId])]
          : current.model_ids.filter((id) => id !== modelId);
        return updateTeamAccess(team.team_id, {
          user_ids: current.user_ids,
          skill_ids: current.skill_ids,
          model_ids: nextModelIds,
        });
      });

      const settled = await Promise.allSettled([...userOps, ...teamOps]);
      const failed = settled.filter((item) => item.status === 'rejected').length;
      await loadAssignmentData();
      setAssignmentModalOpen(false);
      if (failed > 0) {
        toast('warning', `Saved with ${failed} assignment update issue(s)`);
      } else {
        toast('success', `Assignments saved for ${selectedModelForAccess.modelName}`);
      }
    } catch (err) {
      toast('error', getUserFacingError(err, 'Failed to save model assignments'));
    } finally {
      setSavingAssignments(false);
    }
  };

  const accessibleCount = models.filter((m) => m.userAccess).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">
            {isAdmin ? 'Model Access' : 'Available Models'}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {isAdmin ? 'Manage AI model access across your organization' : 'AI models available for your workspace'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && (
            <button
              onClick={() => setRequestModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-500 rounded-xl shadow-sm hover:shadow-md transition"
            >
              Request Access
            </button>
          )}
          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-400">
              <Brain className="w-3.5 h-3.5" />
              {accessibleCount}/{models.length} user-accessible
            </div>
          )}
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={loadData} className="ml-auto text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline">Retry</button>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 p-1 rounded-2xl bg-[var(--color-surface)]/80 border border-[var(--color-border)]/60 shadow-sm shadow-slate-200/50">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-surface)]/70 border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all duration-200" />
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1 shadow-sm">
          {(['all', 'free', 'standard', 'premium'] as const).map((tier) => (
            <button key={tier} onClick={() => setFilterTier(tier)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                filterTier === tier
                  ? 'bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.35)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-hover)]'
              }`}>
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Models Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} padding="md">
              <div className="flex items-start justify-between mb-4">
                <Skeleton variant="rectangular" width={44} height={44} className="rounded-xl" />
                <Skeleton variant="rectangular" width={60} height={20} className="rounded-full" />
              </div>
              <Skeleton variant="text" width="70%" height={16} />
              <Skeleton variant="text" width="50%" height={12} className="mt-1" />
              <Skeleton variant="text" width="90%" height={12} className="mt-3" />
              <Skeleton variant="text" width="100%" height={1} className="mt-4" />
              <div className="flex justify-between mt-3">
                <Skeleton variant="text" width={80} height={14} />
                <Skeleton variant="rectangular" width={100} height={28} className="rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      ) : visibleModels.length === 0 ? (
        <EmptyState icon={<Brain className="w-8 h-8" />} title="No models found"
          message="No AI models match your search or filter criteria." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleModels.map((model, i) => {
            const tier = tierConfig[model.tier];
            const TierIcon = tier.icon;
            const speed = speedBadge[model.speed];
            const costProfile = getModelCostProfile(model);
            const modelAssignedUsers = users.filter((user) => user.allowed_models.includes(model.modelId)).length;
            const modelAssignedTeams = teams.filter((team) => (teamAccessMap[team.team_id]?.model_ids || []).includes(model.modelId)).length;
            return (
              <motion.div key={model.modelId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}>
                <Card hover className="h-full flex flex-col group/card relative overflow-hidden border border-white/70 bg-white/75 backdrop-blur-sm shadow-sm shadow-slate-300/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-300/65">
                  <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br ${tier.glow}`} />
                  <div className="relative flex items-start justify-between mb-5">
                    <div className={`w-12 h-12 rounded-2xl border ${tier.iconWrap} flex items-center justify-center transition-all duration-300 group-hover/card:scale-110 group-hover/card:shadow-md`}>
                      <Brain className="w-5 h-5" />
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full border backdrop-blur-sm ${tier.badge}`}>
                      <TierIcon className="w-3 h-3" /> {tier.label}
                    </span>
                  </div>

                  <h4 className="relative text-xl font-extrabold text-[var(--color-text-main)] mb-0.5 leading-tight">{model.modelName}</h4>
                  <p className="relative text-sm text-[var(--color-text-muted)] mb-1.5 capitalize">{model.provider}</p>
                  <p className="relative text-base text-[var(--color-text-muted)] leading-relaxed mb-5 flex-1">{model.description}</p>
                  <div className="relative mb-4 rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-surface)]/70 px-3 py-2">
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Cost / 1K tokens: <span className="font-mono text-[var(--color-text-main)]">${costProfile.promptPer1k.toFixed(4)} in</span> · <span className="font-mono text-[var(--color-text-main)]">${costProfile.completionPer1k.toFixed(4)} out</span>
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      Est. monthly: <span className="font-mono text-[var(--color-text-main)]">{costProfile.estimatedMonthlyTokens.toLocaleString()} tok</span> · <span className="font-mono text-[var(--color-text-main)]">${costProfile.estimatedMonthlyCost.toFixed(2)}</span>
                    </p>
                  </div>

                  <div className="relative flex items-center gap-2.5 mb-5 flex-wrap">
                    <div className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface)]/85 border border-[var(--color-border)]/70 px-2.5 py-1 rounded-full">
                      <span className="font-mono font-medium">{model.contextWindow}</span><span>context</span>
                    </div>
                    <div className={`inline-flex items-center gap-1 text-[10px] font-medium ${speed.color} ${speed.chip} border px-2.5 py-1 rounded-full`}>
                      <Zap className="w-3 h-3" /> {speed.label}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface)]/85 border border-[var(--color-border)]/70 px-2.5 py-1 rounded-full">
                      <span className="font-mono font-medium">{(model.maxTokens / 1000).toFixed(0)}K</span><span>tokens</span>
                    </div>
                  </div>

                  <div className="relative pt-3 border-t border-[var(--color-border)]/70">
                    {isAdmin ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--color-text-muted)]">
                            <span className="font-mono font-medium text-[var(--color-text-main)]">{model.rateLimit}</span>/min
                          </span>
                          <button
                            onClick={() => toggleUserAccess(model.modelId)}
                            disabled={toggling === model.modelId}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 disabled:opacity-50 ${
                              model.userAccess
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md hover:shadow-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:-translate-y-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            {toggling === model.modelId ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : model.userAccess ? (
                              <><Unlock className="w-3 h-3" /> User Access</>
                            ) : (
                              <><Lock className="w-3 h-3" /> Admin Only</>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {modelAssignedUsers} users · {modelAssignedTeams} teams
                          </span>
                          <button
                            onClick={() => void openAssignAccessModal(model)}
                            className="text-xs font-medium px-3 py-1.5 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
                          >
                            Assign Access
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <Check className="w-3.5 h-3.5" /> Accessible in your workspace
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <>
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-main)] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--color-accent)]" /> Secret References
              </h3>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setSecretModalOpen(true)}>
                Add Secret
              </Button>
            </div>

            {secrets.length === 0 ? (
              <Card>
                <EmptyState icon={<Link2 className="w-6 h-6" />} title="No secret references"
                  message="Create a secret reference before adding model configurations." />
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {secrets.map((secret) => (
                  <Card key={secret.reference_key} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Reference</p>
                        <p className="text-sm font-semibold text-[var(--color-text-main)] truncate">{secret.reference_key}</p>
                      </div>
                      <StatusBadge status={secret.is_active ? 'active' : 'revoked'} label={secret.is_active ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>{secret.provider}</span>
                      <span>{new Date(secret.created_at).toLocaleDateString()}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-main)] flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[var(--color-accent)]" /> Model Configurations
              </h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={loadAdminConfig}>Reload</Button>
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreateConfigModal}>Create Config</Button>
              </div>
            </div>

            {configs.length === 0 ? (
              <Card>
                <EmptyState icon={<SlidersHorizontal className="w-6 h-6" />} title="No model configurations"
                  message="Create model configurations to define provider endpoints, secret references, and runtime parameters." />
              </Card>
            ) : (
              <div className="space-y-3">
                {configs.map((cfg) => (
                  <Card key={cfg.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-[var(--color-text-main)]">{cfg.model_id}</p>
                          <StatusBadge status={cfg.is_active ? 'active' : 'revoked'} label={cfg.is_active ? 'active' : 'inactive'} />
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-surface)] text-[var(--color-text-muted)]">{cfg.provider}</span>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">{cfg.base_url}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                          <div className="bg-[var(--color-surface)] rounded-lg px-2 py-1.5">
                            <p className="text-[var(--color-text-light)]">Secret</p>
                            <p className="font-mono text-[var(--color-text-main)] truncate">{cfg.secret_reference_key}</p>
                          </div>
                          <div className="bg-[var(--color-surface)] rounded-lg px-2 py-1.5">
                            <p className="text-[var(--color-text-light)]">Temp</p>
                            <p className="font-mono text-[var(--color-text-main)]">{cfg.temperature}</p>
                          </div>
                          <div className="bg-[var(--color-surface)] rounded-lg px-2 py-1.5">
                            <p className="text-[var(--color-text-light)]">Max Tokens</p>
                            <p className="font-mono text-[var(--color-text-main)]">{cfg.max_tokens}</p>
                          </div>
                          <div className="bg-[var(--color-surface)] rounded-lg px-2 py-1.5">
                            <p className="text-[var(--color-text-light)]">Timeout</p>
                            <p className="font-mono text-[var(--color-text-main)]">{cfg.request_timeout_seconds}s</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleValidateConfig(cfg)}
                          disabled={validatingConfigId === cfg.id}
                          className="p-2 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50"
                          title="Validate connectivity"
                        >
                          {validatingConfigId === cfg.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => openEditConfigModal(cfg)}
                          className="p-2 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="Edit configuration"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(cfg)}
                          disabled={deletingConfigId === cfg.id}
                          className="p-2 text-[var(--color-text-light)] hover:text-[var(--color-error)] hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete configuration"
                        >
                          {deletingConfigId === cfg.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        isOpen={assignmentModalOpen}
        onClose={() => { setAssignmentModalOpen(false); setSelectedModelForAccess(null); }}
        title="Assign Model Access"
        subtitle={selectedModelForAccess ? `${selectedModelForAccess.modelName} users and teams` : 'Configure model assignments'}
        footer={(
          <>
            <Button variant="ghost" disabled={savingAssignments} onClick={() => { setAssignmentModalOpen(false); setSelectedModelForAccess(null); }}>Cancel</Button>
            <Button loading={savingAssignments} onClick={() => void saveModelAssignments()}>Save Assignments</Button>
          </>
        )}
      >
        {loadingAssignments ? (
          <div className="py-8 text-sm text-[var(--color-text-muted)] flex items-center justify-center">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading assignment options...
          </div>
        ) : (
          <div className="space-y-4">
            {selectedModelForAccess && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-3">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Cost / 1K tokens: <span className="font-mono text-[var(--color-text-main)]">${getModelCostProfile(selectedModelForAccess).promptPer1k.toFixed(4)} in</span> · <span className="font-mono text-[var(--color-text-main)]">${getModelCostProfile(selectedModelForAccess).completionPer1k.toFixed(4)} out</span>
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Estimated monthly spend: <span className="font-mono text-[var(--color-text-main)]">${getModelCostProfile(selectedModelForAccess).estimatedMonthlyCost.toFixed(2)}</span>
                </p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-[var(--color-text-main)] mb-2">Users</h4>
              <div className="max-h-44 overflow-auto rounded-lg border border-[var(--color-border)] p-2 space-y-1">
                {users.map((user) => (
                  <label key={user.user_id} className="flex items-center gap-2 text-sm text-[var(--color-text-main)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignmentUsers.includes(user.user_id)}
                      onChange={() => setAssignmentUsers((prev) => toggleInArray(prev, user.user_id))}
                    />
                    <span>{user.display_name || user.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--color-text-main)] mb-2">Teams</h4>
              <div className="max-h-40 overflow-auto rounded-lg border border-[var(--color-border)] p-2 space-y-1">
                {teams.map((team) => (
                  <label key={team.team_id} className="flex items-center gap-2 text-sm text-[var(--color-text-main)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignmentTeams.includes(team.team_id)}
                      onChange={() => setAssignmentTeams((prev) => toggleInArray(prev, team.team_id))}
                    />
                    <span>{team.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title="Request Model Access"
        subtitle="Submit a request for access to a Snowflake-governed model"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setRequestModalOpen(false)}>Cancel</Button>
            <Button loading={requestingModel} onClick={handleRequestModelAccess}>Submit Request</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Model ID</label>
            <input
              value={requestModelId}
              onChange={(e) => setRequestModelId(e.target.value)}
              placeholder="gpt-4o"
              className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Reason (optional)</label>
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={secretModalOpen}
        onClose={() => setSecretModalOpen(false)}
        title="Add Secret Reference"
        subtitle="Secrets are encrypted at rest and referenced by key in model configurations."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSecretModalOpen(false)}>Cancel</Button>
            <Button loading={savingSecret} onClick={handleCreateSecret}>Save Secret</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Reference Key</label>
            <input
              value={secretForm.reference_key}
              onChange={(e) => setSecretForm((prev) => ({ ...prev, reference_key: e.target.value }))}
              placeholder="OPENAI_API_KEY_PROD"
              className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Provider</label>
            <input
              value={secretForm.provider}
              onChange={(e) => setSecretForm((prev) => ({ ...prev, provider: e.target.value }))}
              placeholder="openai"
              className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Secret Value</label>
            <input
              type="password"
              value={secretForm.secret_value}
              onChange={(e) => setSecretForm((prev) => ({ ...prev, secret_value: e.target.value }))}
              placeholder="sk-..."
              className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={configModalOpen}
        onClose={() => {
          setConfigModalOpen(false);
          setEditingConfig(null);
          setConfigTouched({});
          setConfigSubmitAttempted(false);
        }}
        size="xl"
        title={editingConfig ? 'Edit Model Configuration' : 'Create Model Configuration'}
        subtitle="Set endpoint, secret reference, and runtime controls for this model."
        footer={(
          <>
            <Button variant="ghost" onClick={() => {
              setConfigModalOpen(false);
              setEditingConfig(null);
              setConfigTouched({});
              setConfigSubmitAttempted(false);
            }}>Cancel</Button>
            <Button loading={savingConfig} onClick={handleSaveConfig}>{editingConfig ? 'Update Config' : 'Create Config'}</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 rounded-2xl border border-[var(--color-border)]/70 bg-[var(--color-surface)]/35 p-3 sm:p-3.5 shadow-sm">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">Model ID</label>
            <input
              value={configForm.model_id}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, model_id: e.target.value }))}
              onBlur={() => markTouched('model_id')}
              disabled={Boolean(editingConfig)}
              placeholder="gpt-4.1"
              className={`${inputBaseClass} disabled:opacity-60 ${shouldShowError('model_id') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('model_id') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.model_id}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">Provider</label>
            <input
              value={configForm.provider}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, provider: e.target.value }))}
              onBlur={() => markTouched('provider')}
              disabled={Boolean(editingConfig)}
              placeholder="openai"
              className={`${inputBaseClass} disabled:opacity-60 ${shouldShowError('provider') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('provider') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.provider}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
              Base URL
              <span title="Use a fully-qualified URL, for example: https://api.openai.com/v1/models">
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
              </span>
            </label>
            <input
              value={configForm.base_url}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, base_url: e.target.value }))}
              onBlur={() => markTouched('base_url')}
              placeholder="https://api.openai.com/v1/models"
              className={`${inputBaseClass} ${shouldShowError('base_url') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('base_url') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.base_url}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">Secret Reference Key</label>
            <input
              list="secret-reference-options"
              value={configForm.secret_reference_key}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, secret_reference_key: e.target.value }))}
              onBlur={() => markTouched('secret_reference_key')}
              placeholder="OPENAI_API_KEY_PROD"
              className={`${inputBaseClass} ${shouldShowError('secret_reference_key') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('secret_reference_key') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.secret_reference_key}</p>}
            <datalist id="secret-reference-options">
              {secrets.map((s) => <option key={s.reference_key} value={s.reference_key} />)}
            </datalist>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-main)]">
              <input
                type="checkbox"
                checked={configForm.is_active}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-[var(--color-border)]"
              />
              Active configuration
            </label>
          </div>
          <div>
            <label className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
              Temperature
              <span title={`Allowed range: ${TEMPERATURE_MIN} to ${TEMPERATURE_MAX}`}>
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
              </span>
            </label>
            <input
              type="number"
              step="0.1"
              min={TEMPERATURE_MIN}
              max={TEMPERATURE_MAX}
              value={configForm.temperature}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, temperature: e.target.value }))}
              onBlur={() => markTouched('temperature')}
              className={`${inputBaseClass} ${shouldShowError('temperature') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('temperature') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.temperature}</p>}
          </div>
          <div>
            <label className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
              Max Tokens
              <span title={`Allowed range: ${MAX_TOKENS_MIN} to ${MAX_TOKENS_MAX}`}>
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
              </span>
            </label>
            <input
              type="number"
              min={MAX_TOKENS_MIN}
              max={MAX_TOKENS_MAX}
              step="1"
              value={configForm.max_tokens}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, max_tokens: e.target.value }))}
              onBlur={() => markTouched('max_tokens')}
              className={`${inputBaseClass} ${shouldShowError('max_tokens') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('max_tokens') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.max_tokens}</p>}
            {!shouldShowError('max_tokens') && showVeryHighTokenSoftWarning && (
              <p className="mt-1.5 text-[11px] text-red-700">
                Very high token setting warning: values above {MAX_TOKENS_STRONG_WARNING} can significantly increase latency, queueing risk, and cost.
              </p>
            )}
            {!shouldShowError('max_tokens') && !showVeryHighTokenSoftWarning && showHighTokenSoftWarning && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                High token setting warning: values above {MAX_TOKENS_SOFT_WARNING} can increase latency and cost.
              </p>
            )}
          </div>
          <div>
            <label className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
              Timeout (seconds)
              <span title={`Allowed range: ${TIMEOUT_MIN} to ${TIMEOUT_MAX} seconds`}>
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
              </span>
            </label>
            <input
              type="number"
              min={TIMEOUT_MIN}
              max={TIMEOUT_MAX}
              step="1"
              value={configForm.request_timeout_seconds}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, request_timeout_seconds: e.target.value }))}
              onBlur={() => markTouched('request_timeout_seconds')}
              className={`${inputBaseClass} ${shouldShowError('request_timeout_seconds') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('request_timeout_seconds') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.request_timeout_seconds}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
              Parameters (JSON)
              <span title={'Must be valid JSON, for example: {"top_p":0.95}'}>
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
              </span>
            </label>
            <textarea
              value={configForm.parameters}
              onChange={(e) => setConfigForm((prev) => ({ ...prev, parameters: e.target.value }))}
              onBlur={() => markTouched('parameters')}
              rows={5}
              className={`w-full max-h-48 sm:max-h-56 px-3.5 py-2.5 bg-[var(--color-surface)]/70 border rounded-xl text-xs font-mono text-[var(--color-text-main)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] transition-all duration-200 ${shouldShowError('parameters') ? 'border-red-300 ring-1 ring-red-200/70' : 'border-[var(--color-border)]'}`}
            />
            {shouldShowError('parameters') && <p className="mt-1.5 text-[11px] text-red-600">{configValidationErrors.parameters}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
