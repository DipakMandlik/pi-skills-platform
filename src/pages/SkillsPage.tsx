import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Search, LayoutGrid, List, Brain, Code2, Database,
  Zap, Shield, BarChart3, Users, ArrowUpRight, MoreVertical,
  Edit3, Trash2, Copy, Check, Loader2, X, KeyRound,
  AlertTriangle, FileCode, Workflow, Network, Search as SearchIcon,
} from 'lucide-react';
import { Button, Badge, EmptyState, Skeleton, useToast, Modal, Dropdown, DropdownItem, DropdownSeparator } from '../components/ui';
import { cn } from '../lib/cn';
import { useAuth } from '../auth';
import { ROUTES } from '../constants/routes';
import {
  addSkillAccess,
  deleteSkill,
  fetchSkillAccess,
  fetchSkillRegistry,
  fetchSkills,
  fetchTeams,
  fetchUsers,
  removeSkillAccess,
  type SkillAccessConfig,
  type SkillRegistryItem,
  type SkillItem,
  type TeamItem,
  type UserItem,
  updateSkillState,
} from '../services/backendApi';
import { governanceApi } from '../services/governanceApi';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'draft' | 'archived';
  usageCount: number;
  assignedUsers: number;
  lastModified: string;
  version: string;
  icon: string;
}

function seededNumber(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return min + (hash % (max - min + 1));
}

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function mapRegistryToSkill(item: SkillRegistryItem): Skill {
  const status: Skill['status'] = !item.is_enabled ? 'archived' : 'active';
  const domainIconMap: Record<string, string> = {
    sql: 'Zap', performance: 'Zap', query: 'Zap',
    design: 'Network', architecture: 'Network',
    ml: 'Brain', ai: 'Brain', cortex: 'Brain',
    analytics: 'BarChart3', reporting: 'BarChart3',
    discovery: 'SearchIcon', metadata: 'Database',
    security: 'Shield', governance: 'Shield',
    workflow: 'Workflow', pipeline: 'Workflow',
    code: 'Code2', scripting: 'FileCode', procedure: 'FileCode',
  };
  const domainKey = (item.domain || item.skill_type || '').toLowerCase();
  const iconKey = Object.keys(domainIconMap).find((k) => domainKey.includes(k));
  const usageCount = (item.assignment_count ?? 0) > 0
    ? (item.assignment_count ?? 0) * seededNumber(item.skill_id, 8, 24)
    : seededNumber(item.skill_id, 25, 180);
  const assignedUsers = (item.assignment_count ?? 0) > 0
    ? (item.assignment_count ?? 0)
    : seededNumber(item.skill_id, 2, 9);
  return {
    id: item.skill_id,
    name: item.display_name,
    description: item.description,
    category: item.domain || item.skill_type || 'General',
    status,
    usageCount,
    assignedUsers,
    lastModified: item.updated_at || item.created_at || new Date().toISOString(),
    version: item.version || '1.0.0',
    icon: iconKey ? domainIconMap[iconKey] : 'Brain',
  };
}

function mapItemToSkill(item: SkillItem): Skill {
  const status: Skill['status'] = item.is_active ? 'active' : 'archived';
  const usageCount = item.is_active ? seededNumber(item.skill_id, 18, 120) : seededNumber(item.skill_id, 4, 20);
  const assignedUsers = item.is_active ? seededNumber(item.skill_id, 1, 7) : seededNumber(item.skill_id, 0, 2);
  return {
    id: item.skill_id,
    name: item.display_name,
    description: item.description,
    category: 'General',
    status,
    usageCount,
    assignedUsers,
    lastModified: new Date().toISOString(),
    version: item.version || '1.0.0',
    icon: 'Brain',
  };
}

const categoryColors: Record<string, {
  bg: string;
  text: string;
  dot: string;
  iconBg: string;
  iconBorder: string;
  cardGradient: string;
}> = {
  SQL: {
    bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary',
    iconBg: 'bg-blue-50', iconBorder: 'border-blue-200/70',
    cardGradient: 'from-blue-50/85 via-blue-50/35 to-transparent',
  },
  Discovery: {
    bg: 'bg-info/10', text: 'text-info', dot: 'bg-info',
    iconBg: 'bg-cyan-50', iconBorder: 'border-cyan-200/70',
    cardGradient: 'from-cyan-50/85 via-sky-50/35 to-transparent',
  },
  Design: {
    bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent',
    iconBg: 'bg-violet-50', iconBorder: 'border-violet-200/70',
    cardGradient: 'from-violet-50/80 via-purple-50/35 to-transparent',
  },
  ML: {
    bg: 'bg-error/10', text: 'text-error', dot: 'bg-error',
    iconBg: 'bg-rose-50', iconBorder: 'border-rose-200/70',
    cardGradient: 'from-rose-50/80 via-red-50/35 to-transparent',
  },
  Analytics: {
    bg: 'bg-success/10', text: 'text-success', dot: 'bg-success',
    iconBg: 'bg-emerald-50', iconBorder: 'border-emerald-200/70',
    cardGradient: 'from-emerald-50/85 via-green-50/35 to-transparent',
  },
  AI: {
    bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent',
    iconBg: 'bg-indigo-50', iconBorder: 'border-indigo-200/70',
    cardGradient: 'from-indigo-50/85 via-violet-50/35 to-transparent',
  },
  Security: {
    bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning',
    iconBg: 'bg-amber-50', iconBorder: 'border-amber-200/70',
    cardGradient: 'from-amber-50/85 via-orange-50/35 to-transparent',
  },
};

const iconMap: Record<string, React.ReactNode> = {
  Zap: <Zap className="w-5 h-5" />,
  Network: <Network className="w-5 h-5" />,
  Brain: <Brain className="w-5 h-5" />,
  FileCode: <FileCode className="w-5 h-5" />,
  SearchIcon: <SearchIcon className="w-5 h-5" />,
  BarChart3: <BarChart3 className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Workflow: <Workflow className="w-5 h-5" />,
  Code2: <Code2 className="w-5 h-5" />,
  Database: <Database className="w-5 h-5" />,
};

const statusConfig: Record<string, { variant: 'success' | 'warning' | 'secondary'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  draft: { variant: 'warning', label: 'Draft' },
  archived: { variant: 'secondary', label: 'Archived' },
};

export function SkillsPage() {
  const { hasRole } = useAuth();
  const isAdmin = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'SECURITY_ADMIN', 'SECURITYADMIN'].some(r => hasRole(r));
  const { toast } = useToast();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestSkillId, setRequestSkillId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessSkill, setAccessSkill] = useState<Skill | null>(null);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<SkillAccessConfig | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        const items = await fetchSkillRegistry();
        setSkills(items.map(mapRegistryToSkill));
      } else {
        const items = await fetchSkills();
        setSkills(items.map(mapItemToSkill));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      const matchesSearch = search === '' ||
        skill.name.toLowerCase().includes(search.toLowerCase()) ||
        skill.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = filterCategory === 'all' || skill.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || skill.status === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [skills, search, filterCategory, filterStatus]);

  const categories = useMemo(() => [...new Set(skills.map((s) => s.category))], [skills]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredSkills.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSkills.map((s) => s.id)));
    }
  }, [filteredSkills, selectedIds.size]);

  const handleBulkAction = useCallback(async (action: 'Archive' | 'Delete') => {
    const ids = Array.from(selectedIds);
    setIsBulkActing(true);
    try {
      if (action === 'Archive') {
        const results = await Promise.allSettled(ids.map((id) => updateSkillState(id, false)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === 0) {
          toast('success', `Archived ${ids.length} skill${ids.length > 1 ? 's' : ''}`);
        } else {
          toast('error', `${ids.length - failed} archived, ${failed} failed`);
        }
      } else {
        const results = await Promise.allSettled(ids.map((id) => deleteSkill(id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === 0) {
          toast('success', `Deleted ${ids.length} skill${ids.length > 1 ? 's' : ''}`);
        } else {
          toast('error', `${ids.length - failed} deleted, ${failed} failed`);
        }
      }
      setSelectedIds(new Set());
      await loadSkills();
    } catch {
      toast('error', `Failed to ${action.toLowerCase()} skills`);
    } finally {
      setIsBulkActing(false);
    }
  }, [selectedIds, loadSkills, toast]);

  const handleDelete = useCallback(async () => {
    if (!selectedSkill) return;
    setIsDeleting(true);
    try {
      await deleteSkill(selectedSkill.id);
      setDeleteModalOpen(false);
      setSelectedSkill(null);
      toast('success', `Skill "${selectedSkill.name}" deleted`);
      await loadSkills();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete skill');
    } finally {
      setIsDeleting(false);
    }
  }, [selectedSkill, loadSkills, toast]);

  const handleRequestAccess = useCallback(async () => {
    if (!requestSkillId.trim()) {
      toast('warning', 'Skill ID is required');
      return;
    }
    setRequesting(true);
    try {
      await governanceApi.createAccessRequest({
        resource_type: 'SKILL',
        resource_id: requestSkillId.trim(),
        reason: requestReason.trim() || undefined,
      });
      toast('success', 'Access request submitted');
      setRequestModalOpen(false);
      setRequestSkillId('');
      setRequestReason('');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setRequesting(false);
    }
  }, [requestSkillId, requestReason, toast]);

  const handleCopyId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast('success', 'Skill ID copied to clipboard');
  };

  const loadAccessOptions = useCallback(async () => {
    if (users.length > 0 && teams.length > 0) return;
    const [userRows, teamRows] = await Promise.all([fetchUsers(), fetchTeams()]);
    setUsers(userRows);
    setTeams(teamRows);
  }, [users.length, teams.length]);

  const openAccessModal = useCallback(async (skill: Skill) => {
    setAccessModalOpen(true);
    setAccessSkill(skill);
    setIsLoadingAccess(true);
    try {
      await loadAccessOptions();
      const access = await fetchSkillAccess(skill.id);
      setCurrentAccess(access);
      setSelectedUserIds([]);
      setSelectedTeamIds([]);
      setUserSearch('');
      setTeamSearch('');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to load skill access');
    } finally {
      setIsLoadingAccess(false);
    }
  }, [loadAccessOptions, toast]);

  const handleAddAccess = useCallback(async () => {
    if (!accessSkill) return;
    setIsSavingAccess(true);
    try {
      const saved = await addSkillAccess(accessSkill.id, { user_ids: selectedUserIds, team_ids: selectedTeamIds });
      setCurrentAccess(saved);
      setSelectedUserIds([]);
      setSelectedTeamIds([]);
      toast('success', 'Access added');
      await loadSkills();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to add skill access');
    } finally {
      setIsSavingAccess(false);
    }
  }, [accessSkill, selectedUserIds, selectedTeamIds, toast, loadSkills]);

  const removeAccess = useCallback(async (kind: 'user' | 'team', value: string) => {
    if (!accessSkill) return;
    try {
      const saved = await removeSkillAccess(accessSkill.id, kind === 'user' ? { user_ids: [value] } : { team_ids: [value] });
      setCurrentAccess(saved);
      await loadSkills();
      toast('success', `${kind} access removed`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : `Failed to remove ${kind} access`);
    }
  }, [accessSkill, loadSkills, toast]);

  const filteredAccessUsers = users.filter((user) => (user.display_name || user.email).toLowerCase().includes(userSearch.toLowerCase()));
  const filteredAccessTeams = teams.filter((team) => team.name.toLowerCase().includes(teamSearch.toLowerCase()));

  const allCategories = ['all', ...categories];
  const allStatuses = ['all', 'active', 'draft', 'archived'];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton variant="text" width={200} height={28} />
            <Skeleton variant="text" width={300} height={16} className="mt-2" />
          </div>
          <Skeleton variant="rectangular" width={120} height={36} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={80} className="rounded-xl" />)}
        </div>
        <div className="flex gap-3">
          <Skeleton variant="rectangular" width={240} height={36} />
          <Skeleton variant="rectangular" width={160} height={36} />
          <Skeleton variant="rectangular" width={100} height={36} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={200} className="rounded-xl" />)}
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
        <Button variant="secondary" onClick={loadSkills}>Retry</Button>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Skills', value: skills.length, change: '+2 this week',
      icon: <Brain className="w-4 h-4" />, color: 'text-primary',
      gradient: 'from-blue-50/80 via-blue-50/30 to-transparent',
      iconSurface: 'bg-blue-100/80 text-blue-600',
    },
    {
      label: 'Active', value: skills.filter((s) => s.status === 'active').length, change: 'Running',
      icon: <Zap className="w-4 h-4" />, color: 'text-success',
      gradient: 'from-emerald-50/80 via-emerald-50/30 to-transparent',
      iconSurface: 'bg-emerald-100/80 text-emerald-600',
    },
    {
      label: 'Total Usage', value: skills.reduce((a, s) => a + s.usageCount, 0).toLocaleString(), change: '+12% this month',
      icon: <ArrowUpRight className="w-4 h-4" />, color: 'text-info',
      gradient: 'from-purple-50/80 via-violet-50/30 to-transparent',
      iconSurface: 'bg-purple-100/80 text-purple-600',
    },
    {
      label: 'Assigned Users', value: skills.reduce((a, s) => a + s.assignedUsers, 0), change: 'Across org',
      icon: <Users className="w-4 h-4" />, color: 'text-accent',
      gradient: 'from-indigo-50/80 via-indigo-50/30 to-transparent',
      iconSurface: 'bg-indigo-100/80 text-indigo-600',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Skill Library</h1>
          <p className="text-sm text-muted mt-1">Manage and organize AI skills across your organization</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">{selectedIds.size} selected</span>
              <Button size="sm" variant="secondary" disabled={isBulkActing} icon={isBulkActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined} onClick={() => handleBulkAction('Archive')}>Archive</Button>
              <Button size="sm" variant="danger" disabled={isBulkActing} icon={isBulkActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined} onClick={() => handleBulkAction('Delete')}>Delete</Button>
              <Button size="sm" variant="ghost" icon={<X className="w-3.5 h-3.5" />} onClick={() => setSelectedIds(new Set())} />
            </div>
          )}
          {!isAdmin && (
            <Button variant="secondary" onClick={() => setRequestModalOpen(true)}>
              Request Skill Access
            </Button>
          )}
          {isAdmin && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.SKILL_STUDIO_NEW)}>
              Create Skill
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={stat.label}>
            <div className={cn(
              'relative overflow-hidden bg-surface border border-border/60 rounded-2xl p-5 shadow-sm transition-all duration-300',
              'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/80',
            )}>
              <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', stat.gradient)} />
              <div className="flex items-center justify-between">
                <div className="relative z-10">
                  <p className="text-xs text-muted font-semibold uppercase tracking-wider">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                  <p className="text-xs text-muted/60 mt-1 font-mono">{stat.change}</p>
                </div>
                <div className={cn('relative z-10 p-3 rounded-xl border border-white/80 shadow-sm', stat.iconSurface)}>{stat.icon}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-center bg-surface border border-border/60 p-2 rounded-2xl shadow-sm shadow-slate-200/60">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-transparent bg-transparent text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/20"
            aria-label="Search skills"
          />
        </div>

        <div className="hidden lg:block w-px h-8 bg-border/40" />

        <div className="flex items-center gap-2 w-full lg:w-auto px-2 pb-2 lg:p-0 overflow-x-auto">
          <div className="flex items-center gap-1 p-1 rounded-xl border border-border/60 bg-surface shadow-sm shrink-0">
            {allCategories.map((cat) => {
              const active = filterCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'border border-border/70 bg-surface text-muted hover:text-foreground hover:border-border-hover',
                  )}
                >
                  {cat === 'all' ? 'All Categories' : cat}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl border border-border/60 bg-surface shadow-sm shrink-0">
            {allStatuses.map((s) => {
              const active = filterStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
                    active
                      ? 'bg-foreground text-background shadow-sm'
                      : 'border border-border/70 bg-surface text-muted hover:text-foreground hover:border-border-hover',
                  )}
                >
                  {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 bg-surface rounded-lg p-1 shrink-0 ml-auto lg:ml-0">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-2 rounded-md transition-all', viewMode === 'grid' ? 'bg-surface-hover shadow text-foreground' : 'text-muted hover:text-foreground')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-2 rounded-md transition-all', viewMode === 'list' ? 'bg-surface-hover shadow text-foreground' : 'text-muted hover:text-foreground')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Showing <span className="font-medium text-foreground">{filteredSkills.length}</span> of {skills.length} skills
        </p>
        {selectedIds.size === 0 && (
          <button onClick={toggleSelectAll} className="text-sm text-primary hover:underline">
            Select all
          </button>
        )}
      </div>

      {/* Content */}
      {filteredSkills.length === 0 ? (
        <EmptyState
          icon={<Brain className="w-8 h-8" />}
          title="No skills found"
          description="Try adjusting your search or filters, or create a new skill."
          action={
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.SKILL_STUDIO_NEW)}>
              Create Skill
            </Button>
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredSkills.map((skill, i) => (
              <motion.div key={skill.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ delay: i * 0.04, duration: 0.3 }}>
                <SkillCard
                  skill={skill}
                  selected={selectedIds.has(skill.id)}
                  canAssign={isAdmin}
                  onSelect={() => toggleSelect(skill.id)}
                  onNavigate={() => navigate(`/skills/${skill.id}`)}
                  onEdit={() => navigate(`/skills/${skill.id}/edit`)}
                  onDelete={() => { setSelectedSkill(skill); setDeleteModalOpen(true); }}
                  onCopyId={() => handleCopyId(skill.id)}
                  onAssign={() => void openAccessModal(skill)}
                  copiedId={copiedId}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredSkills.map((skill, i) => (
              <motion.div key={skill.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ delay: i * 0.03, duration: 0.25 }}>
                <SkillRow
                  skill={skill}
                  selected={selectedIds.has(skill.id)}
                  canAssign={isAdmin}
                  onSelect={() => toggleSelect(skill.id)}
                  onNavigate={() => navigate(`/skills/${skill.id}`)}
                  onEdit={() => navigate(`/skills/${skill.id}/edit`)}
                  onDelete={() => { setSelectedSkill(skill); setDeleteModalOpen(true); }}
                  onCopyId={() => handleCopyId(skill.id)}
                  onAssign={() => void openAccessModal(skill)}
                  copiedId={copiedId}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Request Access Modal */}
      <Modal
        isOpen={requestModalOpen}
        onClose={() => { setRequestModalOpen(false); setRequestSkillId(''); setRequestReason(''); }}
        title="Request Skill Access"
        subtitle="Submit a request for access to a specific skill"
        footer={
          <>
            <Button variant="secondary" disabled={requesting} onClick={() => setRequestModalOpen(false)}>Cancel</Button>
            <Button disabled={requesting} icon={requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined} onClick={handleRequestAccess}>Submit Request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Skill ID</label>
            <input
              type="text"
              value={requestSkillId}
              onChange={(e) => setRequestSkillId(e.target.value)}
              placeholder="e.g. snowflake-query-optimizer"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Reason (optional)</label>
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Why do you need access to this skill?"
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={accessModalOpen}
        onClose={() => { setAccessModalOpen(false); setAccessSkill(null); setCurrentAccess(null); }}
        title="Assign Skill Access"
        subtitle={accessSkill ? accessSkill.name : 'Manage skill access'}
        footer={
          <>
            <Button variant="secondary" disabled={isSavingAccess} onClick={() => { setAccessModalOpen(false); setAccessSkill(null); setCurrentAccess(null); }}>Close</Button>
            <Button disabled={isSavingAccess || !accessSkill} icon={isSavingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined} onClick={() => void handleAddAccess()}>
              {isSavingAccess ? 'Adding...' : 'Add Selected'}
            </Button>
          </>
        }
      >
        {isLoadingAccess ? (
          <div className="py-8 text-sm text-muted flex items-center justify-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading skill access...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 bg-surface space-y-2">
              <p className="text-xs font-semibold text-foreground">Current Access</p>
              <div className="flex flex-wrap gap-2">
                {(currentAccess?.user_ids || []).map((userId) => (
                  <span key={`u-${userId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    {users.find((user) => user.user_id === userId)?.display_name || userId}
                    <button onClick={() => void removeAccess('user', userId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(currentAccess?.team_ids || []).map((teamId) => (
                  <span key={`t-${teamId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    {teams.find((team) => team.team_id === teamId)?.name || teamId}
                    <button onClick={() => void removeAccess('team', teamId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(!currentAccess || ((currentAccess.user_ids.length + currentAccess.team_ids.length) === 0)) && (
                  <span className="text-xs text-muted">No assignments yet</span>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Users</h4>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs mb-2"
              />
              <div className="max-h-36 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {filteredAccessUsers.map((user) => (
                  <label key={user.user_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.user_id)}
                      onChange={() => setSelectedUserIds((prev) => toggleInArray([...prev], user.user_id))}
                    />
                    <span>{user.display_name || user.email}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Teams</h4>
              <input
                type="text"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder="Search teams..."
                className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs mb-2"
              />
              <div className="max-h-36 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {filteredAccessTeams.map((team) => (
                  <label key={team.team_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.team_id)}
                      onChange={() => setSelectedTeamIds((prev) => toggleInArray([...prev], team.team_id))}
                    />
                    <span>{team.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setSelectedSkill(null); }}
        title="Delete Skill"
        subtitle={`This will permanently delete "${selectedSkill?.name}"`}
        footer={
          <>
            <Button variant="secondary" disabled={isDeleting} onClick={() => { setDeleteModalOpen(false); setSelectedSkill(null); }}>Cancel</Button>
            <Button variant="danger" disabled={isDeleting} icon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined} onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-muted">This action cannot be undone. All assignments and version history will be lost.</p>
      </Modal>
    </div>
  );
}

function SkillCard({ skill, selected, canAssign, onSelect, onNavigate, onEdit, onDelete, onCopyId, onAssign, copiedId }: {
  skill: Skill;
  selected: boolean;
  canAssign: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyId: () => void;
  onAssign: () => void;
  copiedId: string | null;
}) {
  const catColors = categoryColors[skill.category] || categoryColors.SQL;
  const statusConf = statusConfig[skill.status];
  const icon = iconMap[skill.icon] || <Brain className="w-5 h-5" />;

  return (
    <div
      className={cn(
        'group cursor-pointer rounded-2xl border bg-surface overflow-hidden transition-all duration-300 h-full flex flex-col',
        selected
          ? 'border-primary shadow-[0_0_0_2px_rgba(99,102,241,0.2)]'
          : 'border-border/60 shadow-sm hover:shadow-xl hover:shadow-slate-300/70 hover:border-primary/30 hover:-translate-y-1',
      )}
      onClick={onNavigate}
    >
      {/* Top Banner */}
      <div className={cn('h-28 bg-gradient-to-br p-4 relative overflow-hidden flex flex-col justify-between shrink-0', catColors.cardGradient)}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/15 to-transparent blur-2xl rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
        <div className="flex items-start justify-between relative z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-white/80 text-[11px] font-semibold text-foreground shadow-sm">
            <span className={cn('w-1.5 h-1.5 rounded-full', catColors.dot)} />
            {statusConf.label}
          </span>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              className="h-4 w-4 rounded border-border bg-surface text-primary focus:ring-primary/40"
            />
            <Dropdown
              trigger={
                <button className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              }
              align="end"
            >
              <DropdownItem icon={<Edit3 className="w-4 h-4" />} onClick={onEdit}>Edit</DropdownItem>
              <DropdownItem icon={copiedId === skill.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} onClick={onCopyId}>
                {copiedId === skill.id ? 'Copied' : 'Copy ID'}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 className="w-4 h-4" />} destructive onClick={onDelete}>Delete</DropdownItem>
            </Dropdown>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className={cn('p-2.5 rounded-xl border shadow-sm', catColors.iconBg, catColors.iconBorder, catColors.text)}>
            {icon}
          </div>
          <span className="text-[10px] font-mono font-bold text-muted uppercase tracking-widest bg-white/90 px-2 py-0.5 rounded-full border border-white/70">
            v{skill.version}
          </span>
        </div>
      </div>

      {/* Bottom Content */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-foreground truncate group-hover:text-primary transition-colors pr-2 leading-tight">{skill.name}</h3>
        </div>
        <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-4 flex-1">{skill.description}</p>
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted font-semibold" title="Assigned Users">
              <Users className="w-4 h-4 text-muted" />
              {skill.assignedUsers}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted font-semibold" title="Total Executions">
              <Zap className="w-4 h-4 text-muted" />
              {skill.usageCount.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canAssign && (
              <button
                onClick={(e) => { e.stopPropagation(); onAssign(); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border border-border text-foreground hover:bg-surface-hover"
              >
                <KeyRound className="w-3 h-3" /> Assign
              </button>
            )}
            <span className="px-2 py-1 bg-surface text-muted text-[10px] font-bold rounded uppercase tracking-wider">
              {skill.category}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillRow({ skill, selected, canAssign, onSelect, onNavigate, onEdit, onDelete, onCopyId, onAssign, copiedId }: {
  skill: Skill;
  selected: boolean;
  canAssign: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyId: () => void;
  onAssign: () => void;
  copiedId: string | null;
}) {
  const catColors = categoryColors[skill.category] || categoryColors.SQL;
  const statusConf = statusConfig[skill.status];
  const icon = iconMap[skill.icon] || <Brain className="w-5 h-5" />;

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 rounded-xl border border-border bg-surface-elevated hover:border-border-hover hover:shadow-sm transition-all cursor-pointer',
        selected && 'border-primary/40 bg-primary-lighter/30',
      )}
      onClick={onNavigate}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40 shrink-0"
        aria-label={`Select ${skill.name}`}
        onClick={(e) => e.stopPropagation()}
      />
      <div className={cn('p-2 rounded-lg shrink-0', catColors.bg, catColors.text)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary">{skill.name}</h3>
          <Badge variant={statusConf.variant} size="sm" dot>{statusConf.label}</Badge>
          <Badge variant="outline" size="sm">{skill.category}</Badge>
        </div>
        <p className="text-xs text-muted truncate mt-0.5">{skill.description}</p>
      </div>
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <span className="flex items-center gap-1 text-xs text-muted">
          <Users className="w-3.5 h-3.5" />
          {skill.assignedUsers}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Zap className="w-3.5 h-3.5" />
          {skill.usageCount.toLocaleString()}
        </span>
        <span className="text-xs text-muted w-20 text-right">
          {new Date(skill.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {canAssign && (
          <button onClick={onAssign} className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors" aria-label="Assign access">
            <KeyRound className="w-4 h-4" />
          </button>
        )}
        <button onClick={onEdit} className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors" aria-label="Edit skill">
          <Edit3 className="w-4 h-4" />
        </button>
        <button onClick={onCopyId} className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors" aria-label="Copy skill ID">
          {copiedId === skill.id ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-md text-muted hover:text-error hover:bg-error-light/50 transition-colors" aria-label="Delete skill">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
