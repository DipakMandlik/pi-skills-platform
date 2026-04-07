import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Trash2, UserPlus, UserMinus, Puzzle, LayoutGrid, List, Users, Sparkles, AlertTriangle, FileJson, Power, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth';
import { RoleGuard } from '../../auth';
import { Card, Button, DataTable, Modal, StatusBadge, EmptyState, ConfirmDialog, Tabs } from '../common';
import type { Column } from '../common';
import { useToast } from '../ui';
import { fetchSkills, fetchUsers, assignSkill, revokeSkill, fetchSkillRegistry, updateSkillState, deleteSkill, type SkillRegistryItem, type UserItem } from '../../services/backendApi';
import { getUserFacingError } from '../../services/errorUtils';

interface SkillRecord {
  id: string;
  name: string;
  description: string;
  assignedTo: number;
  status: 'active' | 'draft';
  createdAt: string;
  category: string;
}

interface AssignmentRecord {
  id: string;
  skillId: string;
  userName: string;
  userEmail: string;
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
  assignedAt: string;
}

const categoryColors: Record<string, string> = {
  SQL: 'bg-blue-100 text-blue-600',
  Discovery: 'bg-cyan-100 text-cyan-600',
  Design: 'bg-purple-100 text-purple-600',
  ML: 'bg-rose-100 text-rose-600',
  Analytics: 'bg-emerald-100 text-emerald-600',
  AI: 'bg-violet-100 text-violet-600',
  Security: 'bg-amber-100 text-amber-600',
};

export function SkillsManagement() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'DATA_ENGINEER'].some(r => hasRole(r));

  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [backendUsers, setBackendUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [tabKey, setTabKey] = useState('skills');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('SQL');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignDuration, setAssignDuration] = useState('30');
  const [assigning, setAssigning] = useState(false);
  const [skillRegistry, setSkillRegistry] = useState<SkillRegistryItem[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [togglingSkillId, setTogglingSkillId] = useState<string | null>(null);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [selectedContractSkillId, setSelectedContractSkillId] = useState<string | null>(null);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const items = await fetchSkills();
      setSkills(items.map((s, i) => ({
        id: s.skill_id,
        name: s.display_name,
        description: s.description,
        assignedTo: s.assignment ? 1 : 0,
        status: s.is_active ? 'active' as const : 'draft' as const,
        createdAt: new Date().toISOString().split('T')[0],
        category: s.required_models[0]?.includes('gemini') ? 'AI' : s.required_models[0]?.includes('gpt') ? 'AI' : 'SQL',
      })));
    } catch (e) {
      toast('error', getUserFacingError(e, 'Failed to load skills'));
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      const users = await fetchUsers();
      setBackendUsers(users);
    } catch (e) {
      toast('error', getUserFacingError(e, 'Failed to load users'));
    }
  };

  const loadRegistry = async () => {
    if (!isAdmin) return;
    setLoadingRegistry(true);
    try {
      const items = await fetchSkillRegistry();
      setSkillRegistry(items);
    } catch (e) {
      toast('error', getUserFacingError(e, 'Failed to load skill contracts'));
    } finally {
      setLoadingRegistry(false);
    }
  };

  useEffect(() => { loadSkills(); loadUsers(); loadRegistry(); }, []);

  const assignDays = Number.parseInt(assignDuration || '', 10);
  const isAssignDurationValid = Number.isFinite(assignDays) && assignDays >= 1 && assignDays <= 365;

  const filteredSkills = skills.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const activeAssignments = assignments.filter((a) => a.status !== 'revoked');
  const activeSkillCount = skills.filter((s) => s.status === 'active').length;
  const draftSkillCount = skills.filter((s) => s.status === 'draft').length;

  const handleCreateSkill = () => {
    if (!newSkillName.trim()) return;
    const newSkill: SkillRecord = {
      id: `s_${Date.now()}`,
      name: newSkillName.trim(),
      description: newSkillDesc.trim(),
      assignedTo: 0,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      category: newSkillCategory,
    };
    setSkills([newSkill, ...skills]);
    setNewSkillName('');
    setNewSkillDesc('');
    setCreateModalOpen(false);
    toast('success', `Skill "${newSkill.name}" created successfully`);
  };

  const handleAssignSkill = async () => {
    if (!selectedSkillId || !assignUserId) return;
    if (!isAssignDurationValid) {
      toast('warning', 'Access duration must be between 1 and 365 days.');
      return;
    }

    setAssigning(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + assignDays);
      await assignSkill(assignUserId, selectedSkillId, expiresAt.toISOString());
      toast('success', 'Skill assigned successfully');
      setAssignUserId('');
      setAssignDuration('30');
      setAssignModalOpen(false);
      loadSkills();
    } catch (e) {
      toast('error', getUserFacingError(e, 'Failed to assign skill'), {
        action: { label: 'Retry', onClick: () => void handleAssignSkill() },
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleRevokeAssignment = async (assignmentId: string, userId: string, skillId: string) => {
    try {
      await revokeSkill(userId, skillId);
      toast('success', 'Access revoked');
      loadSkills();
    } catch (e) {
      toast('error', getUserFacingError(e, 'Failed to revoke'));
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await deleteSkill(skillId);
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
      toast('success', 'Skill deleted successfully');
    } catch (e) {
      toast('error', getUserFacingError(e, 'Failed to delete skill'));
    }
  };

  const handleToggleSkillState = async (skillId: string) => {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;

    const targetEnabled = skill.status !== 'active';
    setTogglingSkillId(skillId);
    setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, status: targetEnabled ? 'active' : 'draft' } : s)));

    try {
      await updateSkillState(skillId, targetEnabled);
      await loadRegistry();
      toast('success', `Skill ${targetEnabled ? 'enabled' : 'disabled'} successfully`);
    } catch (e) {
      setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, status: skill.status } : s)));
      toast('error', getUserFacingError(e, 'Failed to update skill state'));
    } finally {
      setTogglingSkillId(null);
    }
  };

  const openAssignModal = (skillId: string) => {
    setSelectedSkillId(skillId);
    setAssignModalOpen(true);
  };

  const openContractModal = (skillId: string) => {
    setSelectedContractSkillId(skillId);
    setContractModalOpen(true);
  };

  const selectedSkillContract = selectedContractSkillId
    ? skillRegistry.find((item) => item.skill_id === selectedContractSkillId) || null
    : null;

  if (loading) {
    return <div className="p-6 text-center text-[var(--color-text-muted)]">Loading skills...</div>;
  }

  // ── User View ──
  if (!isAdmin) {
    const mySkills = skills.filter((s) => s.assignedTo > 0);

    return (
      <div className="p-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">My Skills</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Skills assigned to your account</p>
        </motion.div>

        {mySkills.length === 0 ? (
          <EmptyState
            icon={<Puzzle className="w-8 h-8" />}
            title="No skills assigned"
            message="Contact your administrator to get skills assigned to your account."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mySkills.map((skill, i) => (
              <motion.div key={skill.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.35 }}>
                <Card hover className="h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                      <Puzzle className="w-6 h-6 text-blue-500" />
                    </div>
                    <StatusBadge status="active" size="md" />
                  </div>
                  <h4 className="text-base font-bold text-[var(--color-text-main)] mb-1">{skill.name}</h4>
                  <p className="text-sm text-[var(--color-text-muted)] mb-4">{skill.description}</p>
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
      key: 'name',
      header: 'Skill',
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Puzzle className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--color-text-main)]">{val as string}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${categoryColors[row.category] || 'bg-gray-100 text-gray-600'}`}>
                {row.category}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 max-w-xs truncate">{row.description}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned',
      sortable: true,
      align: 'center',
      render: (val) => (
        <div className="flex items-center justify-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--color-text-light)]" />
          <span className="text-sm font-mono font-medium text-[var(--color-text-main)]">{val as number}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (val) => <StatusBadge status={val === 'active' ? 'active' : 'pending'} label={val as string} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (val) => (
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
          {new Date(val as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openAssignModal(row.id); }}
            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors"
            title="Assign skill"
          >
            <UserPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openContractModal(row.id); }}
            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors"
            title="View contract"
          >
            <FileJson className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleSkillState(row.id); }}
            disabled={togglingSkillId === row.id}
            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            title={row.status === 'active' ? 'Disable skill' : 'Enable skill'}
          >
            {togglingSkillId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(row.id); }}
            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-error)] hover:bg-red-50 rounded-lg transition-colors"
            title="Delete skill"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">Skills Management</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Create, assign, and manage AI skills across your organization
          </p>
        </div>
        <RoleGuard role="DATA_ENGINEER">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateModalOpen(true)}>
            Create Skill
          </Button>
        </RoleGuard>
      </motion.div>

      {/* Stats bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg text-xs font-medium text-emerald-700">
          <Sparkles className="w-3.5 h-3.5" />
          {activeSkillCount} active
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg text-xs font-medium text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          {draftSkillCount} draft
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg text-xs font-medium text-blue-700">
          <Users className="w-3.5 h-3.5" />
          {activeAssignments.length} assignments
        </div>
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-0.5">
          {(['all', 'active', 'draft'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filterStatus === status
                  ? 'bg-white text-[var(--color-text-main)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white text-[var(--color-text-main)] shadow-sm' : 'text-[var(--color-text-light)] hover:text-[var(--color-text-main)]'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-white text-[var(--color-text-main)] shadow-sm' : 'text-[var(--color-text-light)] hover:text-[var(--color-text-main)]'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'skills', label: 'Skills', badge: skills.length },
          { key: 'assignments', label: 'Assignments', badge: activeAssignments.length },
        ]}
        activeKey={tabKey}
        onChange={setTabKey}
      />

      {/* Content */}
      <AnimatePresence mode="wait">
        {tabKey === 'skills' ? (
          <motion.div
            key="skills"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {viewMode === 'table' ? (
              <DataTable
                columns={columns}
                data={filteredSkills}
                emptyMessage="No skills found"
                rowKey="id"
                paginated
                defaultPageSize={5}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSkills.map((skill, i) => (
                  <motion.div
                    key={skill.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card hover className="h-full">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                          <Puzzle className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${categoryColors[skill.category] || 'bg-gray-100 text-gray-600'}`}>
                            {skill.category}
                          </span>
                          <StatusBadge status={skill.status === 'active' ? 'active' : 'pending'} />
                        </div>
                      </div>
                      <h4 className="text-sm font-bold text-[var(--color-text-main)] mb-1">{skill.name}</h4>
                      <p className="text-xs text-[var(--color-text-muted)] mb-3">{skill.description}</p>
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                          <Users className="w-3.5 h-3.5" />
                          {skill.assignedTo} assigned
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openAssignModal(skill.id)}
                            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openContractModal(skill.id)}
                            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleSkillState(skill.id)}
                            disabled={togglingSkillId === skill.id}
                            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-accent)] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {togglingSkillId === skill.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(skill.id)}
                            className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-error)] hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="assignments"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card padding="none">
              <div className="divide-y divide-[var(--color-border)]">
                {activeAssignments.length === 0 ? (
                  <EmptyState
                    icon={<Users className="w-6 h-6" />}
                    title="No active assignments"
                    message="Assign skills to users to see them here."
                  />
                ) : (
                  activeAssignments.map((assignment, i) => {
                    const skill = skills.find((s) => s.id === assignment.skillId);
                    const isExpired = new Date(assignment.expiresAt) < new Date();
                    const daysLeft = Math.max(0, Math.ceil((new Date(assignment.expiresAt).getTime() - Date.now()) / 86400000));
                    return (
                      <motion.div
                        key={assignment.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface)]/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-secondary)] flex items-center justify-center text-white text-sm font-bold shadow-sm">
                            {assignment.userName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[var(--color-text-main)]">{assignment.userName}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-[var(--color-text-muted)]">{skill?.name}</span>
                              <span className="text-[10px] text-[var(--color-text-light)]">·</span>
                              <span className={`text-xs ${daysLeft < 7 ? 'text-red-500 font-medium' : 'text-[var(--color-text-muted)]'}`}>
                                {daysLeft > 0 ? `${daysLeft}d remaining` : 'Expired'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={isExpired ? 'expired' : assignment.status} />
                          <RoleGuard role="DATA_ENGINEER">
                            <button
                              onClick={() => setConfirmRevoke(assignment.id)}
                              className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-error)] hover:bg-red-50 rounded-lg transition-colors"
                              title="Revoke access"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </RoleGuard>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Skill Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Skill"
        subtitle="Add a new AI skill to the platform"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSkill} disabled={!newSkillName.trim()}>Create Skill</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Skill Name</label>
            <input
              type="text"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="e.g., Data Quality Engineer"
              className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Category</label>
            <select
              value={newSkillCategory}
              onChange={(e) => setNewSkillCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white transition-colors"
            >
              {Object.keys(categoryColors).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={newSkillDesc}
              onChange={(e) => setNewSkillDesc(e.target.value)}
              placeholder="Describe what this skill does..."
              rows={3}
              className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all resize-none"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={contractModalOpen}
        onClose={() => { setContractModalOpen(false); setSelectedContractSkillId(null); }}
        title="Skill Contract"
        subtitle={selectedSkillContract ? `${selectedSkillContract.display_name} • v${selectedSkillContract.version}` : 'Contract details'}
        size="xl"
        footer={<Button variant="secondary" onClick={() => { setContractModalOpen(false); setSelectedContractSkillId(null); }}>Close</Button>}
      >
        {loadingRegistry ? (
          <div className="text-sm text-[var(--color-text-muted)]">Loading contract...</div>
        ) : !selectedSkillContract ? (
          <EmptyState icon={<FileJson className="w-6 h-6" />} title="Contract unavailable" message="No registry data found for this skill." />
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Execution Handler</div>
              <div className="text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2">{selectedSkillContract.execution_handler}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Input Schema</div>
              <pre className="text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 overflow-auto max-h-48">{JSON.stringify(selectedSkillContract.input_schema, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Output Format</div>
              <pre className="text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 overflow-auto max-h-48">{JSON.stringify(selectedSkillContract.output_format, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Error Handling</div>
              <pre className="text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 overflow-auto max-h-48">{JSON.stringify(selectedSkillContract.error_handling, null, 2)}</pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Skill Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => { setAssignModalOpen(false); setSelectedSkillId(null); }}
        title="Assign Skill"
        subtitle={selectedSkillId ? `Assign "${skills.find((s) => s.id === selectedSkillId)?.name}" to a user` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAssignModalOpen(false); setSelectedSkillId(null); }} disabled={assigning}>Cancel</Button>
            <Button onClick={handleAssignSkill} disabled={!assignUserId || !isAssignDurationValid} loading={assigning}>Assign Skill</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">User</label>
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white transition-colors"
            >
              <option value="">Select a user...</option>
              {backendUsers.map((user) => (
                <option key={user.user_id} value={user.user_id}>{user.display_name} ({user.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Access Duration (days)</label>
            <input
              type="number"
              value={assignDuration}
              onChange={(e) => setAssignDuration(e.target.value)}
              min="1"
              max="365"
              className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white transition-colors"
            />
            {!isAssignDurationValid && (
              <p className="text-[11px] text-red-600 mt-1">Enter a value between 1 and 365.</p>
            )}
            <p className="text-[11px] text-[var(--color-text-light)] mt-1.5">
              Expires on {new Date(Date.now() + (isAssignDurationValid ? assignDays : 0) * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </Modal>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => {
          setConfirmRevoke(null);
          toast('success', 'Access revoked');
        }}
        title="Revoke Skill Access"
        message="This user will lose access to this skill immediately."
        confirmLabel="Revoke Access"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteSkill(confirmDelete)}
        title="Delete Skill"
        message="This will permanently delete the skill and all its assignments. This action cannot be undone."
        confirmLabel="Delete Skill"
        variant="danger"
      />
    </div>
  );
}
