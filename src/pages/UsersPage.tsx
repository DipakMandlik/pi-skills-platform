import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, Search, Shield, UserCog, Mail, Edit3, Check, AlertTriangle, Loader2, Power, KeyRound } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton, Input, Modal, useToast } from '../components/ui';
import { cn } from '../lib/cn';
import { adminApi, type AccessRequest } from '../services/governanceApi';
import {
  addUserAccess,
  fetchModels,
  fetchSkillRegistry,
  fetchTeams,
  fetchUserAccess,
  fetchUsers,
  inviteUser,
  removeUserAccess,
  updateUserRole,
  updateUserStatus,
  type ModelItem,
  type SkillRegistryItem,
  type TeamItem,
  type UserAccessConfig,
  type UserItem,
} from '../services/backendApi';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Member' | 'Viewer';
  skills: number;
  models: number;
  lastActive: string | null;
  status: 'active' | 'inactive';
}

function mapUserItem(u: UserItem): User {
  const roleMap: Record<string, User['role']> = { admin: 'Admin', user: 'Member', viewer: 'Viewer' };
  return {
    id: u.user_id,
    name: u.display_name || u.email.split('@')[0],
    email: u.email,
    role: roleMap[u.role] ?? 'Member',
    skills: u.allowed_skills.length,
    models: u.allowed_models.length,
    lastActive: u.last_login_at,
    status: u.is_active ? 'active' : 'inactive',
  };
}

const roleBadgeStyle: Record<User['role'], string> = {
  Admin: 'bg-gradient-to-r from-fuchsia-100 to-purple-100 text-fuchsia-700 border border-fuchsia-200/80',
  Member: 'bg-blue-100/90 text-blue-700 border border-blue-200/80',
  Viewer: 'bg-slate-100/90 text-slate-600 border border-slate-200/80',
};

const avatarGradients = [
  'from-amber-100 to-rose-100 text-rose-500',
  'from-cyan-100 to-blue-100 text-blue-500',
  'from-violet-100 to-indigo-100 text-indigo-500',
  'from-emerald-100 to-teal-100 text-teal-500',
  'from-sky-100 to-cyan-100 text-cyan-500',
  'from-indigo-100 to-slate-100 text-indigo-500',
];

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

function getFallbackUsers(): User[] {
  const now = Date.now();
  return [
    { id: 'demo-user-1', name: 'Dipak Mandlik', email: 'dipak.mandlik@company.com', role: 'Admin', skills: 12, models: 4, lastActive: new Date(now - 1000 * 60 * 12).toISOString(), status: 'active' },
    { id: 'demo-user-2', name: 'Bharat Rao', email: 'bharat.rao@company.com', role: 'Admin', skills: 10, models: 4, lastActive: new Date(now - 1000 * 60 * 45).toISOString(), status: 'active' },
    { id: 'demo-user-3', name: 'Chetan Thorat', email: 'chetan.thorat@company.com', role: 'Member', skills: 8, models: 3, lastActive: new Date(now - 1000 * 60 * 90).toISOString(), status: 'active' },
    { id: 'demo-user-4', name: 'Mayuri Gawande', email: 'mayuri.gawande@company.com', role: 'Member', skills: 7, models: 3, lastActive: new Date(now - 1000 * 60 * 180).toISOString(), status: 'active' },
    { id: 'demo-user-5', name: 'Omkar Wakchaure', email: 'omkar.wakchaure@company.com', role: 'Member', skills: 6, models: 2, lastActive: new Date(now - 1000 * 60 * 240).toISOString(), status: 'active' },
    { id: 'demo-user-6', name: 'Renuka Gavande', email: 'renuka.gavande@company.com', role: 'Viewer', skills: 4, models: 2, lastActive: new Date(now - 1000 * 60 * 360).toISOString(), status: 'active' },
    { id: 'demo-user-7', name: 'Rushikesh Joshi', email: 'rushikesh.joshi@company.com', role: 'Viewer', skills: 3, models: 1, lastActive: new Date(now - 1000 * 60 * 480).toISOString(), status: 'inactive' },
  ];
}

function getFallbackUserItems(): UserItem[] {
  return [
    {
      user_id: 'demo-user-1', email: 'dipak.mandlik@company.com', display_name: 'Dipak Mandlik', role: 'admin', is_active: true, last_login_at: new Date().toISOString(),
      allowed_models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-haiku'], allowed_skills: ['query-optimizer', 'schema-discovery', 'sql-generator'],
    },
    {
      user_id: 'demo-user-2', email: 'bharat.rao@company.com', display_name: 'Bharat Rao', role: 'admin', is_active: true, last_login_at: new Date().toISOString(),
      allowed_models: ['gpt-4o', 'gpt-4o-mini'], allowed_skills: ['query-optimizer', 'schema-discovery'],
    },
    {
      user_id: 'demo-user-3', email: 'chetan.thorat@company.com', display_name: 'Chetan Thorat', role: 'user', is_active: true, last_login_at: new Date().toISOString(),
      allowed_models: ['gpt-4o-mini', 'claude-3-haiku'], allowed_skills: ['query-optimizer', 'schema-discovery'],
    },
    {
      user_id: 'demo-user-4', email: 'mayuri.gawande@company.com', display_name: 'Mayuri Gawande', role: 'user', is_active: true, last_login_at: new Date().toISOString(),
      allowed_models: ['gpt-4o-mini', 'llama-3-8b'], allowed_skills: ['query-optimizer', 'data-quality-check'],
    },
    {
      user_id: 'demo-user-5', email: 'omkar.wakchaure@company.com', display_name: 'Omkar Wakchaure', role: 'user', is_active: true, last_login_at: new Date().toISOString(),
      allowed_models: ['gpt-4o-mini'], allowed_skills: ['sql-generator'],
    },
    {
      user_id: 'demo-user-6', email: 'renuka.gavande@company.com', display_name: 'Renuka Gavande', role: 'viewer', is_active: true, last_login_at: new Date().toISOString(),
      allowed_models: ['llama-3-8b'], allowed_skills: ['schema-discovery'],
    },
    {
      user_id: 'demo-user-7', email: 'rushikesh.joshi@company.com', display_name: 'Rushikesh Joshi', role: 'viewer', is_active: false, last_login_at: null,
      allowed_models: ['llama-3-8b'], allowed_skills: ['schema-discovery'],
    },
  ] as UserItem[];
}

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

type RequestFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

function normalizeRequestStatus(status: string | undefined): RequestFilter {
  const upper = String(status || '').toUpperCase();
  if (upper === 'PENDING' || upper === 'APPROVED' || upper === 'REJECTED') return upper;
  return 'PENDING';
}

export function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [rawUsers, setRawUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Member' | 'Viewer'>('Member');
  const [isInviting, setIsInviting] = useState(false);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ email: string; password: string } | null>(null);

  // Edit role modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [isLoadingAccessOptions, setIsLoadingAccessOptions] = useState(false);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillRegistryItem[]>([]);
  const [modelsCatalog, setModelsCatalog] = useState<ModelItem[]>([]);
  const [teamsCatalog, setTeamsCatalog] = useState<TeamItem[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [accessSnapshot, setAccessSnapshot] = useState<UserAccessConfig | null>(null);
  const [skillSearch, setSkillSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('PENDING');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestActionLoading, setRequestActionLoading] = useState<Record<string, 'approve' | 'reject' | null>>({});
  const [approveExpiresAt, setApproveExpiresAt] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchUsers();
      const mapped = items.map(mapUserItem);
      setUsers(mapped.length > 0 ? mapped : getFallbackUsers());
      setRawUsers(items.length > 0 ? items : getFallbackUserItems());
    } catch {
      setUsers(getFallbackUsers());
      setRawUsers(getFallbackUserItems());
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccessRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await adminApi.listAccessRequests();
      const normalized = (res.requests || [])
        .filter((item) => {
          const resourceType = String(item.resource_type || '').toUpperCase();
          return resourceType === 'SKILL' || resourceType === 'MODEL';
        })
        .map((item) => ({
          ...item,
          resource_type: String(item.resource_type || '').toUpperCase(),
          status: normalizeRequestStatus(item.status),
        }));
      setAccessRequests(normalized);
    } catch (err: unknown) {
      setRequestsError(err instanceof Error ? err.message : 'Failed to load access requests');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const loadAccessOptions = useCallback(async () => {
    if (skillsCatalog.length > 0 && modelsCatalog.length > 0 && teamsCatalog.length > 0) return;
    setIsLoadingAccessOptions(true);
    try {
      const [skills, models, teams] = await Promise.all([fetchSkillRegistry(), fetchModels(), fetchTeams()]);
      setSkillsCatalog(skills);
      setModelsCatalog(models);
      setTeamsCatalog(teams);
    } catch {
      setSkillsCatalog([]);
      setModelsCatalog([]);
      setTeamsCatalog([]);
    } finally {
      setIsLoadingAccessOptions(false);
    }
  }, [skillsCatalog.length, modelsCatalog.length, teamsCatalog.length]);

  const openAccessModal = useCallback(async (user: User) => {
    setAccessUser(user);
    await loadAccessOptions();
    try {
      const access = await fetchUserAccess(user.id);
      setAccessSnapshot(access);
    } catch {
      const source = rawUsers.find((item) => item.user_id === user.id);
      setAccessSnapshot({
        user_id: user.id,
        skill_ids: source?.allowed_skills || [],
        model_ids: source?.allowed_models || [],
        team_ids: [],
      });
    }
    setSelectedSkillIds([]);
    setSelectedModelIds([]);
    setSelectedTeamIds([]);
    setSkillSearch('');
    setModelSearch('');
    setTeamSearch('');
  }, [loadAccessOptions, rawUsers]);

  const saveUserAccess = useCallback(async () => {
    if (!accessUser) return;
    setIsSavingAccess(true);
    try {
      const added = await addUserAccess(accessUser.id, {
        skill_ids: selectedSkillIds,
        model_ids: selectedModelIds,
        team_ids: selectedTeamIds,
      });
      await loadUsers();
      setAccessSnapshot(added);
      setSelectedSkillIds([]);
      setSelectedModelIds([]);
      setSelectedTeamIds([]);
      toast('success', 'Access added');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to update user access');
    } finally {
      setIsSavingAccess(false);
    }
  }, [accessUser, selectedSkillIds, selectedModelIds, selectedTeamIds, loadUsers, toast]);

  const removeAccessItem = useCallback(async (kind: 'skill' | 'model' | 'team', value: string) => {
    if (!accessUser) return;
    try {
      const payload = kind === 'skill'
        ? { skill_ids: [value] }
        : kind === 'model'
          ? { model_ids: [value] }
          : { team_ids: [value] };
      const updated = await removeUserAccess(accessUser.id, payload);
      setAccessSnapshot(updated);
      await loadUsers();
      toast('success', `${kind} access removed`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to remove access');
    }
  }, [accessUser, loadUsers, toast]);

  const filteredSkillCatalog = skillsCatalog.filter((skill) => skill.display_name.toLowerCase().includes(skillSearch.toLowerCase()));
  const filteredModelCatalog = modelsCatalog.filter((model) => (model.display_name || model.model_id).toLowerCase().includes(modelSearch.toLowerCase()));
  const filteredTeamCatalog = teamsCatalog.filter((team) => team.name.toLowerCase().includes(teamSearch.toLowerCase()));

  useEffect(() => {
    void loadUsers();
    void loadAccessRequests();
  }, [loadUsers, loadAccessRequests]);

  const requesterNameMap = useMemo(() => {
    const byEmail = new Map<string, string>();
    const byUsername = new Map<string, string>();
    rawUsers.forEach((user) => {
      const label = user.display_name || user.email;
      byEmail.set(user.email.toLowerCase(), label);
      const normalizedId = user.user_id.includes(':') ? user.user_id.split(':').pop() || user.user_id : user.user_id;
      byUsername.set(normalizedId.toLowerCase(), label);
    });
    return { byEmail, byUsername };
  }, [rawUsers]);

  const displayRequester = useCallback((requester: string): string => {
    const raw = String(requester || '').trim();
    const byEmail = requesterNameMap.byEmail.get(raw.toLowerCase());
    if (byEmail) return byEmail;
    const username = raw.includes(':') ? raw.split(':').pop() || raw : raw;
    const byUsername = requesterNameMap.byUsername.get(username.toLowerCase());
    return byUsername || raw;
  }, [requesterNameMap]);

  const filteredRequests = accessRequests.filter((req) => {
    const status = normalizeRequestStatus(req.status);
    const query = requestSearch.trim().toLowerCase();
    if (requestFilter !== 'ALL' && status !== requestFilter) return false;
    if (!query) return true;
    const requester = displayRequester(req.requester).toLowerCase();
    const resource = `${req.resource_type} ${req.resource_id}`.toLowerCase();
    const reason = String(req.reason || '').toLowerCase();
    return requester.includes(query) || resource.includes(query) || reason.includes(query);
  });

  const runRequestAction = useCallback(async (
    requestId: string,
    action: 'approve' | 'reject',
  ) => {
    setRequestActionLoading((prev) => ({ ...prev, [requestId]: action }));
    try {
      if (action === 'approve') {
        await adminApi.approveAccessRequest(requestId, approveExpiresAt[requestId] || undefined);
      } else {
        await adminApi.rejectAccessRequest(requestId, rejectReasons[requestId] || undefined);
      }
      setAccessRequests((prev) =>
        prev.map((item) => (item.request_id === requestId
          ? {
            ...item,
            status: action === 'approve' ? 'APPROVED' : 'REJECTED',
            reviewed_at: item.reviewed_at || new Date().toISOString(),
            reason: action === 'reject' ? (rejectReasons[requestId] || item.reason || null) : item.reason,
          }
          : item)),
      );
      await loadUsers();
      await loadAccessRequests();
      toast('success', action === 'approve' ? 'Request approved' : 'Request rejected');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : `Failed to ${action} request`);
    } finally {
      setRequestActionLoading((prev) => ({ ...prev, [requestId]: null }));
    }
  }, [approveExpiresAt, rejectReasons, loadUsers, loadAccessRequests, toast]);

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      const res = await inviteUser({
        email: inviteEmail.trim(),
        display_name: inviteName.trim() || undefined,
        role: inviteRole.toLowerCase(),
      });
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteName('');
      setTempPasswordModal({ email: res.email, password: res.temp_password });
      await loadUsers();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setIsInviting(false);
    }
  }, [inviteEmail, inviteName, inviteRole, loadUsers, toast]);

  const handleRoleSave = useCallback(async () => {
    if (!editingUser) return;
    const originalUsers = users;
    // Optimistic update
    setUsers((prev) => prev.map((u) => u.id === editingUser.id ? { ...u, role: editingUser.role } : u));
    setEditingUser(null);
    setIsSavingRole(true);
    try {
      const backendRole = { Admin: 'admin', Member: 'user', Viewer: 'viewer' }[editingUser.role];
      await updateUserRole(editingUser.id, backendRole);
      toast('success', 'Role updated');
    } catch (err: unknown) {
      // Revert
      setUsers(originalUsers);
      toast('error', err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setIsSavingRole(false);
    }
  }, [editingUser, users, toast]);

  const handleStatusToggle = useCallback(async (user: User) => {
    const newStatus = user.status === 'active' ? false : true;
    // Optimistic update
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, status: newStatus ? 'active' : 'inactive' } : u));
    try {
      await updateUserStatus(user.id, newStatus);
      toast('success', newStatus ? 'User activated' : 'User deactivated');
    } catch (err: unknown) {
      // Revert
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, status: user.status } : u));
      toast('error', err instanceof Error ? err.message : 'Failed to update user status');
    }
  }, [toast]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={160} height={28} />
        <div className="flex gap-3">
          <Skeleton variant="rectangular" width={300} height={42} />
          <Skeleton variant="rectangular" width={136} height={42} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={132} className="rounded-2xl" />
          ))}
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
        <Button variant="secondary" onClick={loadUsers}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted mt-1">{users.length} users in your organization</p>
        </div>
        <button
          onClick={() => setInviteModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/35 transition-all duration-200"
        >
          <Plus className="w-4 h-4" /> Invite User
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm rounded-2xl border border-border/70 bg-surface shadow-sm shadow-slate-200/50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full h-10 pl-9 pr-3 rounded-2xl border border-transparent bg-transparent text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/30"
            aria-label="Search users"
          />
        </div>
      </div>

      <Card className="border border-border/70 rounded-2xl">
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Access Requests</h2>
              <p className="text-xs text-muted mt-0.5">Review skill and model requests from users</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadAccessRequests()}
                disabled={requestsLoading}
                icon={requestsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                placeholder="Search requester, skill, model..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setRequestFilter(item)}
                  className={cn(
                    'px-3 h-9 rounded-lg border text-xs font-medium transition-colors',
                    requestFilter === item
                      ? 'border-primary bg-primary-lighter text-primary'
                      : 'border-border text-muted hover:text-foreground hover:border-border-hover',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {requestsError ? (
            <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <span className="text-xs text-amber-800">Access requests unavailable: {requestsError}</span>
              <Button variant="secondary" size="sm" onClick={() => void loadAccessRequests()}>Retry</Button>
            </div>
          ) : requestsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} variant="rectangular" height={52} className="rounded-lg" />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
              No access requests found.
            </div>
          ) : (
            <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
              {filteredRequests.map((req) => {
                const isPending = normalizeRequestStatus(req.status) === 'PENDING';
                const loadingState = requestActionLoading[req.request_id];
                const statusClass = normalizeRequestStatus(req.status) === 'APPROVED'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : normalizeRequestStatus(req.status) === 'REJECTED'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';
                return (
                  <div key={req.request_id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{displayRequester(req.requester)}</span>
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold', statusClass)}>
                            {normalizeRequestStatus(req.status)}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-[11px] text-muted">
                            {String(req.resource_type || '').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          Resource: <span className="font-medium text-foreground">{req.resource_id}</span>
                          {' • '}
                          Requested {req.requested_at ? new Date(req.requested_at).toLocaleString() : 'N/A'}
                        </p>
                        {req.reason && <p className="text-xs text-muted">Reason: {req.reason}</p>}
                        {req.reviewed_by && (
                          <p className="text-xs text-muted">
                            Reviewed by {req.reviewed_by}{req.reviewed_at ? ` at ${new Date(req.reviewed_at).toLocaleString()}` : ''}
                          </p>
                        )}
                      </div>

                      {isPending && (
                        <div className="w-full xl:w-[460px] space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="datetime-local"
                              value={approveExpiresAt[req.request_id] || ''}
                              onChange={(e) => setApproveExpiresAt((prev) => ({ ...prev, [req.request_id]: e.target.value }))}
                              className="h-8 px-2.5 rounded-md border border-border bg-background text-xs"
                              title="Optional expiry for approval"
                            />
                            <input
                              type="text"
                              value={rejectReasons[req.request_id] || ''}
                              onChange={(e) => setRejectReasons((prev) => ({ ...prev, [req.request_id]: e.target.value }))}
                              placeholder="Optional rejection reason"
                              className="h-8 px-2.5 rounded-md border border-border bg-background text-xs"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => void runRequestAction(req.request_id, 'approve')}
                              disabled={loadingState !== undefined && loadingState !== null}
                              icon={loadingState === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void runRequestAction(req.request_id, 'reject')}
                              disabled={loadingState !== undefined && loadingState !== null}
                              icon={loadingState === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {filteredUsers.length === 0 ? (
        <Card>
          <EmptyState icon={<UserCog className="w-8 h-8" />} title="No users found" description="Try adjusting your search or invite a new user." action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setInviteModalOpen(true)}>Invite User</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredUsers.map((user, i) => {
            const gradientClass = avatarGradients[i % avatarGradients.length];
            const isInactive = user.status === 'inactive';
            return (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card
                  className={cn(
                    'group overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-white to-slate-50/60 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-300/60',
                    isInactive && 'opacity-60',
                  )}
                  padding="none"
                >
                  <div className="flex items-start justify-between px-5 py-5">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className={cn('w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center text-2xl font-bold shadow-sm', gradientClass)}>
                          {getInitials(user.name)}
                        </div>
                        <span className={cn(
                          'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white',
                          isInactive ? 'bg-slate-400' : 'bg-emerald-400',
                        )} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xl font-bold text-foreground leading-tight truncate">{user.name}</p>
                        <p className="text-sm text-muted mt-0.5 truncate">{user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-foreground leading-none">{user.skills} <span className="text-xs font-medium text-muted">Skills</span></div>
                        <div className="text-xs text-muted mt-0.5">{user.models} models</div>
                      </div>
                      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-xl text-[12px] font-semibold', roleBadgeStyle[user.role])}>
                        {user.role}
                      </span>
                      <button
                        onClick={() => void openAccessModal(user)}
                        className="w-9 h-9 rounded-full border border-border/70 bg-surface text-muted flex items-center justify-center transition-all duration-200 hover:bg-surface-hover hover:text-foreground hover:scale-105"
                        aria-label={`Manage access for ${user.name}`}
                        title="Manage model and skill access"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingUser(user)}
                        className="w-9 h-9 rounded-full border border-border/70 bg-surface text-muted flex items-center justify-center transition-all duration-200 hover:bg-surface-hover hover:text-foreground hover:scale-105"
                        aria-label={`Edit ${user.name}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-border/60 px-5 py-2.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm text-muted">
                      <span className={cn('w-2 h-2 rounded-full', isInactive ? 'bg-slate-400' : 'bg-emerald-400')} />
                      {isInactive ? 'Inactive' : user.lastActive ? `Active ${new Date(user.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Active'}
                    </span>
                    <button
                      onClick={() => handleStatusToggle(user)}
                      className={cn(
                        'flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors',
                        isInactive
                          ? 'text-success hover:bg-success/10'
                          : 'text-muted hover:bg-error/10 hover:text-error',
                      )}
                      title={isInactive ? 'Activate user' : 'Deactivate user'}
                    >
                      <Power className="w-3 h-3" />
                      {isInactive ? 'Activate' : 'Deactivate'}
                    </button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => { setInviteModalOpen(false); setInviteEmail(''); setInviteName(''); }}
        title="Invite User"
        subtitle="Create a new user account with a temporary password"
        footer={
          <>
            <Button variant="secondary" disabled={isInviting} onClick={() => { setInviteModalOpen(false); setInviteEmail(''); setInviteName(''); }}>Cancel</Button>
            <Button
              icon={isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || isInviting}
            >
              {isInviting ? 'Creating…' : 'Create User'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="user@example.com"
            autoFocus
          />
          <Input
            label="Display Name (optional)"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name"
          />
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Role</label>
            <div className="flex gap-2">
              {(['Member', 'Viewer'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setInviteRole(role)}
                  className={cn(
                    'flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                    inviteRole === role
                      ? 'border-primary bg-primary-lighter text-primary'
                      : 'border-border bg-surface text-muted hover:border-border-hover',
                  )}
                >
                  {inviteRole === role && <Check className="w-4 h-4" />}
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Temp Password Modal */}
      {tempPasswordModal && (
        <Modal
          isOpen={!!tempPasswordModal}
          onClose={() => setTempPasswordModal(null)}
          title="User Created"
          subtitle={`Account created for ${tempPasswordModal.email}`}
          footer={
            <Button onClick={() => setTempPasswordModal(null)}>Done</Button>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">Share this temporary password with the user. They should change it on first login.</p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-surface border border-border">
              <code className="flex-1 text-sm font-mono text-foreground">{tempPasswordModal.password}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(tempPasswordModal.password); toast('success', 'Password copied'); }}
                className="text-xs text-primary hover:underline"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-muted">This password is shown only once.</p>
          </div>
        </Modal>
      )}

      {/* Edit Role Modal */}
      <Modal
        isOpen={!!accessUser}
        onClose={() => setAccessUser(null)}
        title="Manage User Access"
        subtitle={accessUser?.name}
        footer={
          <>
            <Button variant="secondary" disabled={isSavingAccess} onClick={() => setAccessUser(null)}>Cancel</Button>
            <Button
              disabled={isSavingAccess}
              icon={isSavingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              onClick={() => void saveUserAccess()}
            >
              Add Selected
            </Button>
          </>
        }
      >
        {isLoadingAccessOptions ? (
          <div className="py-6 text-sm text-muted flex items-center justify-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading access options...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Current Access</p>
              <div className="flex flex-wrap gap-2">
                {(accessSnapshot?.skill_ids || []).map((skillId) => (
                  <span key={`skill-${skillId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    Skill: {skillId}
                    <button onClick={() => void removeAccessItem('skill', skillId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(accessSnapshot?.model_ids || []).map((modelId) => (
                  <span key={`model-${modelId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    Model: {modelId}
                    <button onClick={() => void removeAccessItem('model', modelId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(accessSnapshot?.team_ids || []).map((teamId) => (
                  <span key={`team-${teamId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    Team: {teamsCatalog.find((team) => team.team_id === teamId)?.name || teamId}
                    <button onClick={() => void removeAccessItem('team', teamId)} className="text-muted hover:text-error">×</button>
                  </span>
                ))}
                {(!accessSnapshot || ((accessSnapshot.skill_ids.length + accessSnapshot.model_ids.length + accessSnapshot.team_ids.length) === 0)) && (
                  <span className="text-xs text-muted">No existing assignments</span>
                )}
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
              <div className="max-h-40 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {skillsCatalog.length === 0 ? (
                  <p className="text-xs text-muted px-1 py-2">No skills available</p>
                ) : filteredSkillCatalog.map((skill) => (
                  <label key={skill.skill_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSkillIds.includes(skill.skill_id)}
                      onChange={() => setSelectedSkillIds((prev) => toggleInArray(prev, skill.skill_id))}
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
              <div className="max-h-40 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {modelsCatalog.length === 0 ? (
                  <p className="text-xs text-muted px-1 py-2">No models available</p>
                ) : filteredModelCatalog.map((model) => (
                  <label key={model.model_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedModelIds.includes(model.model_id)}
                      onChange={() => setSelectedModelIds((prev) => toggleInArray(prev, model.model_id))}
                    />
                    <span>{model.display_name || model.model_id}</span>
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
              <div className="max-h-40 overflow-auto rounded-lg border border-border p-2 space-y-1">
                {teamsCatalog.length === 0 ? (
                  <p className="text-xs text-muted px-1 py-2">No teams available</p>
                ) : filteredTeamCatalog.map((team) => (
                  <label key={team.team_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.team_id)}
                      onChange={() => setSelectedTeamIds((prev) => toggleInArray(prev, team.team_id))}
                    />
                    <span>{team.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit User Role"
        subtitle={editingUser?.name}
        footer={
          <>
            <Button variant="secondary" disabled={isSavingRole} onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button
              disabled={isSavingRole}
              icon={isSavingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              onClick={handleRoleSave}
            >
              Save
            </Button>
          </>
        }
      >
        {editingUser && (
          <div className="space-y-2">
            {(['Admin', 'Member', 'Viewer'] as const).map((role) => (
              <button
                key={role}
                onClick={() => setEditingUser({ ...editingUser, role })}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
                  editingUser.role === role
                    ? 'border-primary bg-primary-lighter text-primary'
                    : 'border-border text-muted hover:border-border-hover',
                )}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span className="font-medium">{role}</span>
                  <span className="text-xs text-muted">
                    {role === 'Admin' ? '— Full platform access' : role === 'Member' ? '— Standard access' : '— Read-only access'}
                  </span>
                </div>
                {editingUser.role === role && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
