import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Search, Users, UserCog, Edit3, Trash2, ArrowRight, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { Button, Card, Badge, EmptyState, Skeleton, Modal, useToast } from '../components/ui';
import {
  createTeam,
  deleteTeam,
  fetchModels,
  fetchSkillRegistry,
  fetchTeamAccess,
  fetchTeams,
  fetchUsers,
  updateTeam,
  updateTeamAccess,
  type ModelItem,
  type SkillRegistryItem,
  type TeamAccessConfig,
  type TeamItem,
  type UserItem,
} from '../services/backendApi';

interface Team extends TeamItem {
  members: number;
  skills: string[];
  models: string[];
}

function mapTeam(team: TeamItem, access?: TeamAccessConfig): Team {
  return {
    ...team,
    members: team.member_count,
    skills: access?.skill_ids || [],
    models: access?.model_ids || [],
  };
}

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const DEFAULT_TEAMS: Array<{ name: string; description: string }> = [
  { name: 'Data Engineering', description: 'Warehouse pipelines, ingestion, and transformation reliability.' },
  { name: 'Support', description: 'User support, operational triage, and incident coordination.' },
  { name: 'Analytics Engineering', description: 'Curated semantic models, metrics, and BI-ready datasets.' },
  { name: 'Platform Engineering', description: 'Platform architecture, release quality, and developer experience.' },
  { name: 'Data Platform', description: 'Shared data infrastructure, governance, and observability controls.' },
  { name: 'ML Engineering', description: 'Model serving, evaluation, and MLOps workflows.' },
];

function getFallbackTeams(): Team[] {
  const created = new Date().toISOString();
  return DEFAULT_TEAMS.map((team, index) => ({
    team_id: `demo-team-${index + 1}`,
    name: team.name,
    description: team.description,
    member_count: 0,
    members: 0,
    skills: [],
    models: [],
    created_at: created,
  }));
}

export function TeamsPage() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);

  const [teamForm, setTeamForm] = useState({ name: '', description: '' });
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [accessTeam, setAccessTeam] = useState<Team | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);

  const [teamAccessMap, setTeamAccessMap] = useState<Record<string, TeamAccessConfig>>({});
  const [users, setUsers] = useState<UserItem[]>([]);
  const [skills, setSkills] = useState<SkillRegistryItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);

  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [attemptedAutoSeed, setAttemptedAutoSeed] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<TeamAccessConfig | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let items = await fetchTeams();
      if (!attemptedAutoSeed) {
        setAttemptedAutoSeed(true);
        const existingNames = new Set(items.map((team) => team.name.trim().toLowerCase()));
        const missing = DEFAULT_TEAMS.filter((team) => !existingNames.has(team.name.toLowerCase()));
        if (missing.length > 0) {
          await Promise.allSettled(
            missing.map((team) => createTeam({ name: team.name, description: team.description })),
          );
          items = await fetchTeams();
        }
      }

      const accessRows = await Promise.all(
        items.map(async (team) => {
          try {
            const access = await fetchTeamAccess(team.team_id);
            return access;
          } catch {
            return { team_id: team.team_id, user_ids: [], skill_ids: [], model_ids: [] } as TeamAccessConfig;
          }
        }),
      );

      const accessByTeam = accessRows.reduce((acc, access) => {
        acc[access.team_id] = access;
        return acc;
      }, {} as Record<string, TeamAccessConfig>);

      setTeamAccessMap(accessByTeam);
      setTeams(items.map((team) => mapTeam(team, accessByTeam[team.team_id])));
    } catch (err: unknown) {
      setTeams(getFallbackTeams());
      setTeamAccessMap({});
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [attemptedAutoSeed]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const loadAccessOptions = useCallback(async () => {
    if (users.length > 0 && skills.length > 0 && models.length > 0) return;

    const [userRows, skillRows, modelRows] = await Promise.all([
      fetchUsers(),
      fetchSkillRegistry(),
      fetchModels(),
    ]);
    setUsers(userRows);
    setSkills(skillRows);
    setModels(modelRows);
  }, [users.length, skills.length, models.length]);

  const filteredTeams = useMemo(() => teams.filter((team) =>
    team.name.toLowerCase().includes(search.toLowerCase()) ||
    team.description.toLowerCase().includes(search.toLowerCase()),
  ), [teams, search]);

  const resetForm = () => {
    setTeamForm({ name: '', description: '' });
    setEditingTeam(null);
  };

  const handleCreate = useCallback(async () => {
    if (!teamForm.name.trim()) {
      toast('error', 'Team name is required');
      return;
    }
    setIsSaving(true);
    try {
      const created = await createTeam({
        name: teamForm.name.trim(),
        description: teamForm.description.trim(),
      });
      setTeams((prev) => [mapTeam(created), ...prev]);
      setCreateModalOpen(false);
      resetForm();
      toast('success', `Team "${created.name}" created`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setIsSaving(false);
    }
  }, [teamForm, toast]);

  const handleEdit = useCallback(async () => {
    if (!editingTeam || !teamForm.name.trim()) {
      toast('error', 'Team name is required');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateTeam(editingTeam.team_id, {
        name: teamForm.name.trim(),
        description: teamForm.description.trim(),
      });
      setTeams((prev) => prev.map((team) => (
        team.team_id === updated.team_id ? mapTeam(updated, teamAccessMap[updated.team_id]) : team
      )));
      setEditModalOpen(false);
      resetForm();
      toast('success', `Team "${updated.name}" updated`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to update team');
    } finally {
      setIsSaving(false);
    }
  }, [editingTeam, teamForm, toast, teamAccessMap]);

  const handleDelete = useCallback(async () => {
    if (!deletingTeam) return;
    setIsDeleting(true);
    try {
      await deleteTeam(deletingTeam.team_id);
      setTeams((prev) => prev.filter((team) => team.team_id !== deletingTeam.team_id));
      setDeleteModalOpen(false);
      setDeletingTeam(null);
      toast('success', `Team "${deletingTeam.name}" deleted`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  }, [deletingTeam, toast]);

  const openAccessModal = useCallback(async (team: Team) => {
    setAccessTeam(team);
    setAccessModalOpen(true);
    setIsLoadingAccess(true);

    try {
      await loadAccessOptions();
      const access = await fetchTeamAccess(team.team_id);
      setCurrentAccess(access);
      setSelectedUsers([]);
      setSelectedSkills([]);
      setSelectedModels([]);
      setUserSearch('');
      setSkillSearch('');
      setModelSearch('');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to load team access');
    } finally {
      setIsLoadingAccess(false);
    }
  }, [loadAccessOptions, toast]);

  const handleSaveAccess = useCallback(async () => {
    if (!accessTeam) return;
    setIsSavingAccess(true);
    try {
      const source = currentAccess || { team_id: accessTeam.team_id, user_ids: [], skill_ids: [], model_ids: [] };
      const saved = await updateTeamAccess(accessTeam.team_id, {
        user_ids: [...new Set([...(source.user_ids || []), ...selectedUsers])],
        skill_ids: [...new Set([...(source.skill_ids || []), ...selectedSkills])],
        model_ids: [...new Set([...(source.model_ids || []), ...selectedModels])],
      });

      setCurrentAccess(saved);
      setTeamAccessMap((prev) => ({ ...prev, [saved.team_id]: saved }));
      setTeams((prev) => prev.map((team) => {
        if (team.team_id !== saved.team_id) return team;
        return {
          ...team,
          members: saved.user_ids.length,
          member_count: saved.user_ids.length,
          skills: saved.skill_ids,
          models: saved.model_ids,
        };
      }));

      setSelectedUsers([]);
      setSelectedSkills([]);
      setSelectedModels([]);
      toast('success', 'Access added to team');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to save team access');
    } finally {
      setIsSavingAccess(false);
    }
  }, [accessTeam, currentAccess, selectedUsers, selectedSkills, selectedModels, toast]);

  const removeAccessEntry = useCallback(async (kind: 'user' | 'skill' | 'model', value: string) => {
    if (!accessTeam || !currentAccess) return;
    try {
      const payload = {
        user_ids: kind === 'user' ? currentAccess.user_ids.filter((id) => id !== value) : currentAccess.user_ids,
        skill_ids: kind === 'skill' ? currentAccess.skill_ids.filter((id) => id !== value) : currentAccess.skill_ids,
        model_ids: kind === 'model' ? currentAccess.model_ids.filter((id) => id !== value) : currentAccess.model_ids,
      };
      const saved = await updateTeamAccess(accessTeam.team_id, payload);
      setCurrentAccess(saved);
      setTeamAccessMap((prev) => ({ ...prev, [saved.team_id]: saved }));
      setTeams((prev) => prev.map((team) => team.team_id === saved.team_id ? {
        ...team,
        members: saved.user_ids.length,
        member_count: saved.user_ids.length,
        skills: saved.skill_ids,
        models: saved.model_ids,
      } : team));
      toast('success', `${kind} removed from team`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : `Failed to remove ${kind}`);
    }
  }, [accessTeam, currentAccess, toast]);

  const filteredUsers = users.filter((user) => (user.display_name || user.email).toLowerCase().includes(userSearch.toLowerCase()));
  const filteredSkills = skills.filter((skill) => skill.display_name.toLowerCase().includes(skillSearch.toLowerCase()));
  const filteredModels = models.filter((model) => (model.display_name || model.model_id).toLowerCase().includes(modelSearch.toLowerCase()));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={160} height={28} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={160} className="rounded-xl" />)}
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
        <Button variant="secondary" onClick={() => void loadTeams()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Teams</h1>
          <p className="text-sm text-muted mt-1">{teams.length} teams in your organization</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setCreateModalOpen(true); }}>Create Team</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams..."
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Search teams"
        />
      </div>

      {filteredTeams.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title="No teams found"
          description="Create a team to start organizing your users."
          action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setCreateModalOpen(true); }}>Create Team</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTeams.map((team, i) => (
            <motion.div
              key={team.team_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card hover interactive>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary-light text-primary">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{team.name}</h3>
                      <p className="text-xs text-muted mt-0.5">{team.description}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <UserCog className="w-3.5 h-3.5" />
                      {team.members} members
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <ArrowRight className="w-3.5 h-3.5" />
                      {team.skills.length} skills
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <ArrowRight className="w-3.5 h-3.5" />
                      {team.models.length} models
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      aria-label="Manage team access"
                      onClick={() => void openAccessModal(team)}
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors"
                      aria-label="Edit team"
                      onClick={() => {
                        setEditingTeam(team);
                        setTeamForm({ name: team.name, description: team.description });
                        setEditModalOpen(true);
                      }}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 rounded-md text-muted hover:text-error hover:bg-error-light/50 transition-colors"
                      aria-label="Delete team"
                      onClick={() => {
                        setDeletingTeam(team);
                        setDeleteModalOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="outline" size="sm">{new Date(team.created_at).toLocaleDateString()}</Badge>
                  <Badge variant="info" size="sm">Team Access</Badge>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        isOpen={createModalOpen}
        onClose={() => { setCreateModalOpen(false); resetForm(); }}
        title="Create Team"
        subtitle="Add a new team to your organization"
        footer={
          <>
            <Button variant="secondary" disabled={isSaving} onClick={() => { setCreateModalOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!teamForm.name.trim() || isSaving} icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {isSaving ? 'Creating...' : 'Create Team'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Team Name</label>
            <input
              type="text"
              value={teamForm.name}
              onChange={(e) => setTeamForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Data Engineering"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Description</label>
            <textarea
              value={teamForm.description}
              onChange={(e) => setTeamForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the team's purpose..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); resetForm(); }}
        title="Edit Team"
        subtitle={editingTeam?.name || 'Update team details'}
        footer={
          <>
            <Button variant="secondary" disabled={isSaving} onClick={() => { setEditModalOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleEdit} disabled={!teamForm.name.trim() || isSaving} icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Team Name</label>
            <input
              type="text"
              value={teamForm.name}
              onChange={(e) => setTeamForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Description</label>
            <textarea
              value={teamForm.description}
              onChange={(e) => setTeamForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeletingTeam(null); }}
        title="Delete Team"
        subtitle={deletingTeam ? `Remove ${deletingTeam.name}?` : 'Remove team'}
        footer={
          <>
            <Button variant="secondary" disabled={isDeleting} onClick={() => { setDeleteModalOpen(false); setDeletingTeam(null); }}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting} icon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {isDeleting ? 'Deleting...' : 'Delete Team'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">This will permanently delete the team and remove any team memberships associated with it.</p>
      </Modal>

      <Modal
        isOpen={accessModalOpen}
        onClose={() => { setAccessModalOpen(false); setAccessTeam(null); setCurrentAccess(null); }}
        title="Manage Team Access"
        subtitle={accessTeam ? `${accessTeam.name} members, skills, and models` : 'Configure team access'}
        footer={
          <>
            <Button variant="secondary" disabled={isSavingAccess} onClick={() => { setAccessModalOpen(false); setAccessTeam(null); setCurrentAccess(null); }}>Close</Button>
            <Button onClick={() => void handleSaveAccess()} disabled={isSavingAccess || !accessTeam} icon={isSavingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {isSavingAccess ? 'Adding...' : 'Add Selected'}
            </Button>
          </>
        }
      >
        {isLoadingAccess ? (
          <div className="py-8 flex items-center justify-center text-muted text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading team access...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 bg-surface space-y-3">
              <p className="text-xs font-semibold text-foreground">Current Access (remove explicitly)</p>
              <div className="flex flex-wrap gap-2">
                {(currentAccess?.user_ids || []).map((userId) => (
                  <span key={`u-${userId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    {users.find((user) => user.user_id === userId)?.display_name || userId}
                    <button onClick={() => void removeAccessEntry('user', userId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(currentAccess?.skill_ids || []).map((skillId) => (
                  <span key={`s-${skillId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    {skills.find((skill) => skill.skill_id === skillId)?.display_name || skillId}
                    <button onClick={() => void removeAccessEntry('skill', skillId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(currentAccess?.model_ids || []).map((modelId) => (
                  <span key={`m-${modelId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    {models.find((model) => model.model_id === modelId)?.display_name || modelId}
                    <button onClick={() => void removeAccessEntry('model', modelId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(!currentAccess || ((currentAccess.user_ids.length + currentAccess.skill_ids.length + currentAccess.model_ids.length) === 0)) && (
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
                {filteredUsers.map((user) => (
                  <label key={user.user_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.user_id)}
                      onChange={() => setSelectedUsers((prev) => toggleInArray(prev, user.user_id))}
                    />
                    <span>{user.display_name || user.email}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Skills</h4>
              <input
                type="text"
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder="Search skills..."
                className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs mb-2"
              />
              <div className="max-h-32 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {filteredSkills.map((skill) => (
                  <label key={skill.skill_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSkills.includes(skill.skill_id)}
                      onChange={() => setSelectedSkills((prev) => toggleInArray(prev, skill.skill_id))}
                    />
                    <span>{skill.display_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Models</h4>
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs mb-2"
              />
              <div className="max-h-32 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {filteredModels.map((model) => (
                  <label key={model.model_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.model_id)}
                      onChange={() => setSelectedModels((prev) => toggleInArray(prev, model.model_id))}
                    />
                    <span>{model.display_name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
