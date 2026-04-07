import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Search, Trash2, UserPlus, UserMinus, Clock, Puzzle,
  LayoutGrid, List, Users, Sparkles, AlertTriangle, Filter,
  ChevronLeft, ChevronRight, Loader2, Eye, Edit2,
  ToggleLeft, ToggleRight, CheckCircle2, XCircle, X,
  ArrowRight, ArrowLeft, FileText, Code2, Brain, Shield,
  Database, BarChart3, Settings, Zap
} from 'lucide-react';
import { useAuth } from '../../auth';
import { RoleGuard } from '../../auth';
import { Card, Button, DataTable, Modal, StatusBadge, EmptyState, ConfirmDialog, Tabs } from '../common';
import type { Column } from '../common';
import { useToast } from '../common';
import { skillsApi, usersApi, type SkillRecord, type UserRecord } from '../../api/apiClient';

const SKILL_TYPE_ICONS: Record<string, React.ReactNode> = {
  ai: <Brain className="w-4 h-4" />,
  sql: <Code2 className="w-4 h-4" />,
  hybrid: <Zap className="w-4 h-4" />,
  system: <Settings className="w-4 h-4" />,
};

const SKILL_TYPE_COLORS: Record<string, string> = {
  ai: 'bg-violet-100 text-violet-700 border-violet-200',
  sql: 'bg-blue-100 text-blue-700 border-blue-200',
  hybrid: 'bg-amber-100 text-amber-700 border-amber-200',
  system: 'bg-gray-100 text-gray-700 border-gray-200',
};

const DOMAIN_COLORS: Record<string, string> = {
  analytics: 'bg-emerald-50 text-emerald-700',
  architecture: 'bg-purple-50 text-purple-700',
  content: 'bg-pink-50 text-pink-700',
  data: 'bg-blue-50 text-blue-700',
  engineering: 'bg-cyan-50 text-cyan-700',
  governance: 'bg-orange-50 text-orange-700',
  language: 'bg-indigo-50 text-indigo-700',
  performance: 'bg-red-50 text-red-700',
  quality: 'bg-teal-50 text-teal-700',
  security: 'bg-amber-50 text-amber-700',
  general: 'bg-gray-50 text-gray-700',
};

const CREATION_STEPS = ['Basics', 'Type & Domain', 'Instructions', 'I/O Schema', 'Review'];

export function SkillsManagement() {
  const { user, token, permissions } = useAuth();
  const { toast } = useToast();
  const isAdmin = permissions.createSkill;

  // Data state
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & filters
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSkills, setTotalSkills] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [tabKey, setTabKey] = useState('skills');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{ id: string; enabled: boolean } | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillRecord | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Multi-step creation
  const [creationStep, setCreationStep] = useState(0);
  const [newSkill, setNewSkill] = useState({
    skill_id: '',
    display_name: '',
    description: '',
    skill_type: 'ai',
    domain: 'general',
    instructions: '',
    required_models: [] as string[],
    input_schema: {} as Record<string, unknown>,
    output_format: {} as Record<string, unknown>,
    execution_handler: '',
    error_handling: {} as Record<string, unknown>,
  });

  // Edit state
  const [editSkill, setEditSkill] = useState<Partial<SkillRecord>>({});

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await skillsApi.list(token, {
        page,
        page_size: pageSize,
        search: searchQuery,
        skill_type: filterType,
        domain: filterDomain,
      });
      setSkills(result.skills);
      setTotalPages(result.total_pages);
      setTotalSkills(result.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load skills';
      setError(msg);
      toast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, searchQuery, filterType, filterDomain, toast]);

  const fetchUsers = useCallback(async () => {
    try {
      const result = await usersApi.list(token, 1, 100);
      setUsers(result.users);
    } catch {
      // Users endpoint may not be available; non-critical
    }
  }, [token]);

  useEffect(() => {
    if (isAdmin) {
      fetchSkills();
      fetchUsers();
    }
  }, [isAdmin, fetchSkills, fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSkills();
  };

  const handleCreateSkill = async () => {
    if (!newSkill.skill_id.trim() || !newSkill.display_name.trim()) {
      toast('error', 'Skill ID and name are required');
      return;
    }
    try {
      await skillsApi.create(token, {
        ...newSkill,
        is_enabled: true,
      });
      toast('success', `Skill "${newSkill.display_name}" created`);
      setCreateModalOpen(false);
      setCreationStep(0);
      setNewSkill({
        skill_id: '', display_name: '', description: '',
        skill_type: 'ai', domain: 'general', instructions: '',
        required_models: [], input_schema: {}, output_format: {},
        execution_handler: '', error_handling: {},
      });
      fetchSkills();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create skill';
      toast('error', msg);
    }
  };

  const handleUpdateSkill = async () => {
    if (!selectedSkill) return;
    try {
      await skillsApi.update(token, selectedSkill.skill_id, editSkill);
      toast('success', `Skill "${selectedSkill.display_name}" updated`);
      setEditModalOpen(false);
      fetchSkills();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update skill';
      toast('error', msg);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await skillsApi.delete(token, skillId);
      toast('success', 'Skill deleted');
      setConfirmDelete(null);
      fetchSkills();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete skill';
      toast('error', msg);
    }
  };

  const handleToggleSkill = async (skillId: string, enabled: boolean) => {
    try {
      await skillsApi.toggle(token, skillId, enabled);
      toast('success', `Skill ${enabled ? 'enabled' : 'disabled'}`);
      setConfirmToggle(null);
      fetchSkills();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle skill';
      toast('error', msg);
    }
  };

  const handleAssignSkill = async () => {
    if (!selectedSkill || !selectedUserId) return;
    try {
      await skillsApi.assign(token, selectedUserId, selectedSkill.skill_id);
      toast('success', 'Skill assigned');
      setAssignModalOpen(false);
      setSelectedUserId('');
      fetchSkills();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign skill';
      toast('error', msg);
    }
  };

  const openEditModal = (skill: SkillRecord) => {
    setSelectedSkill(skill);
    setEditSkill({
      display_name: skill.display_name,
      description: skill.description,
      skill_type: skill.skill_type,
      domain: skill.domain,
      instructions: skill.instructions,
      required_models: skill.required_models,
      execution_handler: skill.execution_handler,
    });
    setEditModalOpen(true);
  };

  const openDetailModal = (skill: SkillRecord) => {
    setSelectedSkill(skill);
    setDetailModalOpen(true);
  };

  const openAssignModal = (skill: SkillRecord) => {
    setSelectedSkill(skill);
    setAssignModalOpen(true);
  };

  // ── User View ──
  if (!isAdmin) {
    return (
      <div className="p-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">My Skills</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Skills assigned to your account</p>
        </motion.div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
        ) : skills.length === 0 ? (
          <EmptyState icon={<Puzzle className="w-8 h-8" />} title="No skills assigned" message="Contact your administrator to get skills assigned." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill, i) => (
              <motion.div key={skill.skill_id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card hover className="h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${SKILL_TYPE_COLORS[skill.skill_type] || 'bg-gray-100 text-gray-600'}`}>
                      {SKILL_TYPE_ICONS[skill.skill_type] || <Puzzle className="w-6 h-6" />}
                    </div>
                    <StatusBadge status={skill.is_enabled ? 'active' : 'pending'} />
                  </div>
                  <h4 className="text-base font-bold text-[var(--color-text-main)] mb-1">{skill.display_name}</h4>
                  <p className="text-sm text-[var(--color-text-muted)] mb-4">{skill.description}</p>
                  <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${DOMAIN_COLORS[skill.domain] || 'bg-gray-50 text-gray-600'}`}>{skill.domain}</span>
                    <span className="text-[10px] font-mono text-[var(--color-text-light)]">v{skill.version}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Admin View ──
  const columns: Column<SkillRecord>[] = [
    {
      key: 'display_name',
      header: 'Skill',
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${SKILL_TYPE_COLORS[row.skill_type] || 'bg-gray-100'}`}>
            {SKILL_TYPE_ICONS[row.skill_type] || <Puzzle className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--color-text-main)]">{val as string}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${SKILL_TYPE_COLORS[row.skill_type] || ''}`}>{row.skill_type}</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 max-w-xs truncate">{row.description}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'domain',
      header: 'Domain',
      render: (val) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${DOMAIN_COLORS[val as string] || 'bg-gray-50 text-gray-600'}`}>{val as string}</span>
      ),
    },
    {
      key: 'assignment_count',
      header: 'Users',
      sortable: true,
      align: 'center',
      render: (val) => (
        <div className="flex items-center justify-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
          <span className="text-sm font-mono font-medium">{val as number}</span>
        </div>
      ),
    },
    {
      key: 'is_enabled',
      header: 'Status',
      sortable: true,
      render: (val, row) => (
        <button
          onClick={() => setConfirmToggle({ id: row.skill_id, enabled: !val })}
          className="flex items-center gap-1.5"
        >
          {val ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
          <span className="text-xs">{val ? 'Active' : 'Disabled'}</span>
        </button>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (val) => <span className="text-xs font-mono text-[var(--color-text-muted)]">v{val as string}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '140px',
      render: (_, row) => (
        <div className="flex items-center gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); openDetailModal(row); }} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors" title="View details"><Eye className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); openEditModal(row); }} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); openAssignModal(row); }} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors" title="Assign"><UserPlus className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(row.skill_id); }} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-error)] hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  const activeCount = skills.filter(s => s.is_enabled).length;
  const disabledCount = skills.filter(s => !s.is_enabled).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">Skills Management</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Create, assign, and manage AI skills across your organization</p>
        </div>
        <RoleGuard permission="createSkill">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setCreationStep(0); setCreateModalOpen(true); }}>
            Create Skill
          </Button>
        </RoleGuard>
      </motion.div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg text-xs font-medium text-emerald-700">
          <Sparkles className="w-3.5 h-3.5" />{totalSkills} total
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg text-xs font-medium text-blue-700">
          <CheckCircle2 className="w-3.5 h-3.5" />{activeCount} active
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg text-xs font-medium text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />{disabledCount} disabled
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search skills..." className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all" />
        </div>
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }} className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]">
          <option value="">All Types</option>
          <option value="ai">AI</option>
          <option value="sql">SQL</option>
          <option value="hybrid">Hybrid</option>
          <option value="system">System</option>
        </select>
        <select value={filterDomain} onChange={(e) => { setFilterDomain(e.target.value); setPage(1); }} className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]">
          <option value="">All Domains</option>
          {Object.keys(DOMAIN_COLORS).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <Button variant="secondary" type="submit" icon={<Filter className="w-3.5 h-3.5" />}>Filter</Button>
        <div className="flex items-center gap-0.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-0.5 ml-auto">
          <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white text-[var(--color-text-main)] shadow-sm' : 'text-[var(--color-text-light)]'}`}><List className="w-4 h-4" /></button>
          <button onClick={() => setViewMode('cards')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-white text-[var(--color-text-main)] shadow-sm' : 'text-[var(--color-text-light)]'}`}><LayoutGrid className="w-4 h-4" /></button>
        </div>
      </form>

      {/* Tabs */}
      <Tabs tabs={[{ key: 'skills', label: 'All Skills', badge: totalSkills }]} activeKey={tabKey} onChange={setTabKey} />

      {/* Content */}
      <AnimatePresence mode="wait">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" /></div>
        ) : error ? (
          <EmptyState icon={<XCircle className="w-8 h-8" />} title="Failed to load skills" message={error} />
        ) : skills.length === 0 ? (
          <EmptyState icon={<Puzzle className="w-8 h-8" />} title="No skills found" message="Try adjusting your filters or create a new skill." />
        ) : viewMode === 'table' ? (
          <motion.div key="table" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <DataTable columns={columns} data={skills} emptyMessage="No skills" rowKey="skill_id" />
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages} ({totalSkills} total)</span>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} icon={<ChevronLeft className="w-3.5 h-3.5" />} />
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} icon={<ChevronRight className="w-3.5 h-3.5" />} />
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="cards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {skills.map((skill, i) => (
                <motion.div key={skill.skill_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card hover className="h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${SKILL_TYPE_COLORS[skill.skill_type] || 'bg-gray-100'}`}>
                        {SKILL_TYPE_ICONS[skill.skill_type] || <Puzzle className="w-5 h-5" />}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${SKILL_TYPE_COLORS[skill.skill_type]}`}>{skill.skill_type}</span>
                        <StatusBadge status={skill.is_enabled ? 'active' : 'pending'} />
                      </div>
                    </div>
                    <h4 className="text-sm font-bold text-[var(--color-text-main)] mb-1">{skill.display_name}</h4>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3">{skill.description}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DOMAIN_COLORS[skill.domain]}`}>{skill.domain}</span>
                        <span className="text-[10px] font-mono text-[var(--color-text-light)]">v{skill.version}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => openDetailModal(skill)} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openAssignModal(skill)} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg"><UserPlus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setConfirmDelete(skill.skill_id)} className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-error)] hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} icon={<ChevronLeft className="w-3.5 h-3.5" />} />
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} icon={<ChevronRight className="w-3.5 h-3.5" />} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Multi-Step Create Skill Modal ── */}
      <Modal isOpen={createModalOpen} onClose={() => { setCreateModalOpen(false); setCreationStep(0); }} title="Create New Skill" subtitle={`Step ${creationStep + 1} of ${CREATION_STEPS.length}: ${CREATION_STEPS[creationStep]}`}
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-1">
              {CREATION_STEPS.map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i <= creationStep ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => creationStep > 0 ? setCreationStep(s => s - 1) : setCreateModalOpen(false)} icon={creationStep > 0 ? <ArrowLeft className="w-3.5 h-3.5" /> : undefined}>
                {creationStep > 0 ? 'Back' : 'Cancel'}
              </Button>
              {creationStep < CREATION_STEPS.length - 1 ? (
                <Button onClick={() => setCreationStep(s => s + 1)} iconRight={<ArrowRight className="w-3.5 h-3.5" />}>Next</Button>
              ) : (
                <Button onClick={handleCreateSkill} icon={<Sparkles className="w-3.5 h-3.5" />}>Create Skill</Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Step 0: Basics */}
          {creationStep === 0 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Skill ID <span className="text-red-500">*</span></label>
                <input type="text" value={newSkill.skill_id} onChange={(e) => setNewSkill(s => ({ ...s, skill_id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') }))} placeholder="e.g., skill_data_quality" className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm font-mono text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10" />
                <p className="text-[11px] text-[var(--color-text-light)] mt-1">Lowercase, underscores, hyphens only. Cannot be changed after creation.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Display Name <span className="text-red-500">*</span></label>
                <input type="text" value={newSkill.display_name} onChange={(e) => setNewSkill(s => ({ ...s, display_name: e.target.value }))} placeholder="e.g., Data Quality Engineer" className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={newSkill.description} onChange={(e) => setNewSkill(s => ({ ...s, description: e.target.value }))} placeholder="What does this skill do?" rows={3} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 resize-none" />
              </div>
            </>
          )}

          {/* Step 1: Type & Domain */}
          {creationStep === 1 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Skill Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['ai', 'sql', 'hybrid', 'system'] as const).map(type => (
                    <button key={type} onClick={() => setNewSkill(s => ({ ...s, skill_type: type }))} className={`p-4 rounded-xl border-2 text-left transition-all ${newSkill.skill_type === type ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {SKILL_TYPE_ICONS[type]}
                        <span className="text-sm font-semibold capitalize">{type}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        {type === 'ai' && 'AI/LLM-powered skill'}
                        {type === 'sql' && 'SQL query generation'}
                        {type === 'hybrid' && 'Combines AI + SQL'}
                        {type === 'system' && 'Platform system skill'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Domain</label>
                <select value={newSkill.domain} onChange={(e) => setNewSkill(s => ({ ...s, domain: e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]">
                  {Object.keys(DOMAIN_COLORS).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Required Models (comma-separated)</label>
                <input type="text" value={newSkill.required_models.join(', ')} onChange={(e) => setNewSkill(s => ({ ...s, required_models: e.target.value.split(',').map(m => m.trim()).filter(Boolean) }))} placeholder="e.g., claude-3-5-sonnet-20241022, gpt-4o" className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm font-mono text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)]" />
              </div>
            </>
          )}

          {/* Step 2: Instructions */}
          {creationStep === 2 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">System Instructions</label>
              <p className="text-xs text-[var(--color-text-muted)] mb-2">Define how the AI should behave when this skill is used. This is the system prompt.</p>
              <textarea value={newSkill.instructions} onChange={(e) => setNewSkill(s => ({ ...s, instructions: e.target.value }))} placeholder="You are an expert data engineer. Analyze the provided schema and..." rows={10} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10 resize-none font-mono" />
            </div>
          )}

          {/* Step 3: I/O Schema */}
          {creationStep === 3 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Input Schema (JSON)</label>
                <textarea value={JSON.stringify(newSkill.input_schema, null, 2)} onChange={(e) => { try { setNewSkill(s => ({ ...s, input_schema: JSON.parse(e.target.value) })); } catch { /* ignore invalid JSON while typing */ } }} rows={6} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-xs font-mono text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Output Format (JSON)</label>
                <textarea value={JSON.stringify(newSkill.output_format, null, 2)} onChange={(e) => { try { setNewSkill(s => ({ ...s, output_format: JSON.parse(e.target.value) })); } catch { /* ignore invalid JSON */ } }} rows={6} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-xs font-mono text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Execution Handler</label>
                <input type="text" value={newSkill.execution_handler} onChange={(e) => setNewSkill(s => ({ ...s, execution_handler: e.target.value }))} placeholder="e.g., backend.services.handler:run_skill" className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm font-mono text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)]" />
              </div>
            </>
          )}

          {/* Step 4: Review */}
          {creationStep === 4 && (
            <div className="space-y-3">
              <div className="p-3 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${SKILL_TYPE_COLORS[newSkill.skill_type]}`}>{SKILL_TYPE_ICONS[newSkill.skill_type]}</div>
                  <div>
                    <h4 className="text-sm font-bold">{newSkill.display_name || 'Unnamed Skill'}</h4>
                    <p className="text-xs text-[var(--color-text-muted)]">{newSkill.skill_id || 'no-id'}</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">{newSkill.description || 'No description'}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${SKILL_TYPE_COLORS[newSkill.skill_type]}`}>{newSkill.skill_type}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DOMAIN_COLORS[newSkill.domain]}`}>{newSkill.domain}</span>
                </div>
              </div>
              {newSkill.instructions && (
                <div className="p-3 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
                  <h5 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">Instructions Preview</h5>
                  <p className="text-xs text-[var(--color-text-main)] line-clamp-4 font-mono">{newSkill.instructions}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Ready to create — {newSkill.required_models.length} model(s), {newSkill.instructions.length} instruction chars</span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Edit Skill Modal ── */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Edit: ${selectedSkill?.display_name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateSkill}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Display Name</label>
            <input type="text" value={editSkill.display_name || ''} onChange={(e) => setEditSkill(s => ({ ...s, display_name: e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Description</label>
            <textarea value={editSkill.description || ''} onChange={(e) => setEditSkill(s => ({ ...s, description: e.target.value }))} rows={3} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Type</label>
              <select value={editSkill.skill_type || 'ai'} onChange={(e) => setEditSkill(s => ({ ...s, skill_type: e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]">
                {['ai', 'sql', 'hybrid', 'system'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Domain</label>
              <select value={editSkill.domain || 'general'} onChange={(e) => setEditSkill(s => ({ ...s, domain: e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]">
                {Object.keys(DOMAIN_COLORS).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Instructions</label>
            <textarea value={editSkill.instructions || ''} onChange={(e) => setEditSkill(s => ({ ...s, instructions: e.target.value }))} rows={6} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm font-mono text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] resize-none" />
          </div>
        </div>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal isOpen={detailModalOpen} onClose={() => setDetailModalOpen(false)} title={selectedSkill?.display_name || ''} subtitle={`ID: ${selectedSkill?.skill_id} · v${selectedSkill?.version}`}
        footer={<Button onClick={() => setDetailModalOpen(false)}>Close</Button>}
      >
        {selectedSkill && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${SKILL_TYPE_COLORS[selectedSkill.skill_type]}`}>{selectedSkill.skill_type}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${DOMAIN_COLORS[selectedSkill.domain]}`}>{selectedSkill.domain}</span>
              <StatusBadge status={selectedSkill.is_enabled ? 'active' : 'pending'} />
            </div>
            <p className="text-sm text-[var(--color-text-main)]">{selectedSkill.description}</p>
            {selectedSkill.instructions && (
              <div>
                <h5 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">Instructions</h5>
                <pre className="text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 max-h-48 overflow-auto whitespace-pre-wrap">{selectedSkill.instructions}</pre>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="font-semibold text-[var(--color-text-muted)]">Required Models:</span><p className="font-mono mt-0.5">{selectedSkill.required_models.join(', ') || 'None'}</p></div>
              <div><span className="font-semibold text-[var(--color-text-muted)]">Assigned Users:</span><p className="mt-0.5">{selectedSkill.assignment_count}</p></div>
              <div><span className="font-semibold text-[var(--color-text-muted)]">Handler:</span><p className="font-mono mt-0.5">{selectedSkill.execution_handler || 'None'}</p></div>
              <div><span className="font-semibold text-[var(--color-text-muted)]">Version:</span><p className="mt-0.5">v{selectedSkill.version}</p></div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Assign Modal ── */}
      <Modal isOpen={assignModalOpen} onClose={() => { setAssignModalOpen(false); setSelectedUserId(''); }} title="Assign Skill" subtitle={`Assign "${selectedSkill?.display_name}" to a user`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAssignModalOpen(false); setSelectedUserId(''); }}>Cancel</Button>
            <Button onClick={handleAssignSkill} disabled={!selectedUserId}>Assign</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">User</label>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]">
              <option value="">Select a user...</option>
              {users.map(u => <option key={u.user_id} value={u.user_id}>{u.display_name} ({u.email})</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* ── Confirm Dialogs ── */}
      <ConfirmDialog isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete && handleDeleteSkill(confirmDelete)} title="Delete Skill" message="This will permanently delete the skill and all its assignments. This cannot be undone." confirmLabel="Delete" variant="danger" />
      <ConfirmDialog isOpen={!!confirmToggle} onClose={() => setConfirmToggle(null)} onConfirm={() => confirmToggle && handleToggleSkill(confirmToggle.id, confirmToggle.enabled)} title={confirmToggle?.enabled ? 'Enable Skill' : 'Disable Skill'} message={`This will ${confirmToggle?.enabled ? 'enable' : 'disable'} the skill. ${!confirmToggle?.enabled ? 'Users will lose access.' : ''}`} confirmLabel={confirmToggle?.enabled ? 'Enable' : 'Disable'} variant={confirmToggle?.enabled ? 'info' : 'danger'} />
    </div>
  );
}
