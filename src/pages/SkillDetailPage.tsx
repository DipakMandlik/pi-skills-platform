import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit3, Users, Calendar, Tag, GitBranch,
  MessageSquare, Send, Copy, Check, Eye,
  Shield, Download, MoreVertical, Play, AlertTriangle, Loader2,
} from 'lucide-react';
import { Button, Badge, Card, Tabs, EmptyState, Skeleton, useToast, Dropdown, DropdownItem, DropdownSeparator } from '../components/ui';
import { ROUTES } from '../constants/routes';
import {
  addSkillAccess,
  fetchSkillAccess,
  fetchTeams,
  fetchUsers,
  getSkill,
  executeModel,
  fetchModels,
  removeSkillAccess,
  type SkillAccessConfig,
  type SkillRegistryItem,
  type ModelItem,
  type TeamItem,
  type UserItem,
} from '../services/backendApi';

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function fallbackUsers(): UserItem[] {
  const nowIso = new Date().toISOString();
  return [
    { user_id: 'demo-user-1', email: 'dipak.mandlik@company.com', display_name: 'Dipak Mandlik', role: 'admin', is_active: true, last_login_at: nowIso, allowed_models: [], allowed_skills: [] },
    { user_id: 'demo-user-2', email: 'bharat.rao@company.com', display_name: 'Bharat Rao', role: 'admin', is_active: true, last_login_at: nowIso, allowed_models: [], allowed_skills: [] },
    { user_id: 'demo-user-3', email: 'chetan.thorat@company.com', display_name: 'Chetan Thorat', role: 'user', is_active: true, last_login_at: nowIso, allowed_models: [], allowed_skills: [] },
    { user_id: 'demo-user-4', email: 'mayuri.gawande@company.com', display_name: 'Mayuri Gawande', role: 'user', is_active: true, last_login_at: nowIso, allowed_models: [], allowed_skills: [] },
    { user_id: 'demo-user-5', email: 'omkar.wakchaure@company.com', display_name: 'Omkar Wakchaure', role: 'user', is_active: true, last_login_at: nowIso, allowed_models: [], allowed_skills: [] },
    { user_id: 'demo-user-6', email: 'renuka.gavande@company.com', display_name: 'Renuka Gavande', role: 'viewer', is_active: true, last_login_at: nowIso, allowed_models: [], allowed_skills: [] },
    { user_id: 'demo-user-7', email: 'rushikesh.joshi@company.com', display_name: 'Rushikesh Joshi', role: 'viewer', is_active: false, last_login_at: null, allowed_models: [], allowed_skills: [] },
  ];
}

function fallbackTeams(): TeamItem[] {
  const createdAt = new Date().toISOString();
  return [
    { team_id: 'demo-team-1', name: 'Data Engineering', description: 'Warehouse pipelines and reliability.', member_count: 0, created_at: createdAt },
    { team_id: 'demo-team-2', name: 'Support', description: 'User support and incident triage.', member_count: 0, created_at: createdAt },
    { team_id: 'demo-team-3', name: 'Analytics Engineering', description: 'Curated analytics and reporting.', member_count: 0, created_at: createdAt },
    { team_id: 'demo-team-4', name: 'Platform Engineering', description: 'Platform architecture and DX.', member_count: 0, created_at: createdAt },
    { team_id: 'demo-team-5', name: 'Data Platform', description: 'Shared data infrastructure.', member_count: 0, created_at: createdAt },
    { team_id: 'demo-team-6', name: 'ML Engineering', description: 'Model serving and MLOps.', member_count: 0, created_at: createdAt },
  ];
}

export function SkillDetailPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [skill, setSkill] = useState<SkillRegistryItem | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; error?: boolean }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [access, setAccess] = useState<SkillAccessConfig | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);

  useEffect(() => {
    if (!skillId) return;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      getSkill(skillId),
      fetchModels(),
    ]).then(async ([skillRes, modelsRes]) => {
      if (skillRes.status === 'fulfilled') {
        setSkill(skillRes.value);
      } else {
        setError((skillRes.reason as Error)?.message || 'Skill not found');
      }
      if (modelsRes.status === 'fulfilled') setModels(modelsRes.value);
    }).finally(() => setLoading(false));
  }, [skillId]);

  useEffect(() => {
    if (!skillId) return;
    setLoadingAccess(true);
    Promise.allSettled([fetchSkillAccess(skillId), fetchUsers(), fetchTeams()]).then(([accessRes, usersRes, teamsRes]) => {
      if (accessRes.status === 'fulfilled') setAccess(accessRes.value);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.length > 0 ? usersRes.value : fallbackUsers());
      else setUsers(fallbackUsers());
      if (teamsRes.status === 'fulfilled') setTeams(teamsRes.value.length > 0 ? teamsRes.value : fallbackTeams());
      else setTeams(fallbackTeams());
    }).finally(() => setLoadingAccess(false));
  }, [skillId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || !skill || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setChatLoading(true);

    // Use first required model, or first available model
    const modelId = skill.required_models?.[0] || models.find((m) => m.is_available)?.model_id;
    if (!modelId) {
      setChatMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'No model available for this skill. Ask an admin to assign a model.',
        error: true,
      }]);
      setChatLoading(false);
      return;
    }

    try {
      const res = await executeModel(skill.skill_id, modelId, userMsg, 1000);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.result }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution failed. Please try again.';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: msg, error: true }]);
      toast('error', msg);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopyContent = async () => {
    const text = skill?.instructions || skill?.description || '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('success', 'Skill content copied');
  };

  const handleAddAssignments = async () => {
    if (!skillId) return;
    setSavingAccess(true);
    try {
      const next = await addSkillAccess(skillId, { user_ids: selectedUsers, team_ids: selectedTeams });
      setAccess(next);
      setSelectedUsers([]);
      setSelectedTeams([]);
      toast('success', 'Assignments added');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to add assignments');
    } finally {
      setSavingAccess(false);
    }
  };

  const handleRemoveAssignment = async (kind: 'user' | 'team', value: string) => {
    if (!skillId) return;
    try {
      const next = await removeSkillAccess(skillId, kind === 'user' ? { user_ids: [value] } : { team_ids: [value] });
      setAccess(next);
      toast('success', `${kind} assignment removed`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : `Failed to remove ${kind} assignment`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg shrink-0" />
          <div className="flex-1">
            <Skeleton variant="text" width={240} height={28} />
            <Skeleton variant="text" width={400} height={16} className="mt-2" />
            <div className="flex gap-3 mt-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="text" width={80} height={14} />)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><Skeleton variant="rectangular" height={400} className="rounded-xl" /></div>
          <div className="space-y-4">
            <Skeleton variant="rectangular" height={200} className="rounded-xl" />
            <Skeleton variant="rectangular" height={100} className="rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex items-center gap-2 text-error">
          <AlertTriangle className="w-5 h-5" />
          <p className="text-sm font-medium">{error || 'Skill not found'}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate(ROUTES.SKILLS)}>Back to Skills</Button>
      </div>
    );
  }

  const statusVariant = skill.is_enabled ? 'success' : 'secondary';
  const statusLabel = skill.is_enabled ? 'Active' : 'Archived';
  const category = skill.domain || skill.skill_type || 'General';
  const lastModified = skill.updated_at || skill.created_at;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate(ROUTES.SKILLS)}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors shrink-0"
            aria-label="Back to skills"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{skill.display_name}</h1>
              <Badge variant={statusVariant} dot>{statusLabel}</Badge>
            </div>
            <p className="text-sm text-muted mt-1 max-w-2xl">{skill.description}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="flex items-center gap-1 text-xs text-muted">
                <Tag className="w-3.5 h-3.5" /> {category}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <GitBranch className="w-3.5 h-3.5" /> v{skill.version || '1.0.0'}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Users className="w-3.5 h-3.5" /> {skill.assignment_count ?? 0} assigned
              </span>
              {lastModified && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Calendar className="w-3.5 h-3.5" /> Updated {new Date(lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" icon={<Play className="w-4 h-4" />} onClick={() => setActiveTab('preview')}>Test</Button>
          <Button variant="secondary" icon={<Edit3 className="w-4 h-4" />} onClick={() => navigate(`/skills/${skillId}/edit`)}>Edit</Button>
          <Dropdown
            trigger={<Button variant="secondary" size="icon"><MoreVertical className="w-4 h-4" /></Button>}
            align="end"
          >
            <DropdownItem icon={<Download className="w-4 h-4" />} onClick={handleCopyContent}>Export Skill</DropdownItem>
            <DropdownItem
              icon={<Shield className="w-4 h-4" />}
              onClick={() => {
                setActiveTab('assignments');
                toast('success', 'Showing live assignment details for this skill');
              }}
            >
              View Permissions
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<Edit3 className="w-4 h-4" />} onClick={() => navigate(`/skills/${skillId}/edit`)}>Edit Skill</DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview', icon: <Eye className="w-4 h-4" /> },
          { key: 'preview', label: 'Preview', icon: <MessageSquare className="w-4 h-4" /> },
          { key: 'assignments', label: 'Assignments', icon: <Users className="w-4 h-4" />, badge: skill.assignment_count ?? 0 },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Skill Instructions</h3>
                <Button size="sm" variant="ghost" icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={handleCopyContent}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {skill.instructions ? (
                <div className="prose prose-sm max-w-none text-foreground">
                  {skill.instructions.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.replace('## ', '')}</h2>;
                    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-foreground mt-3 mb-1.5">{line.replace('### ', '')}</h3>;
                    if (line.startsWith('- **')) {
                      const match = line.match(/- \*\*(.+?)\*\*: (.+)/);
                      if (match) return <li key={i} className="text-sm text-muted"><strong className="text-foreground">{match[1]}</strong>: {match[2]}</li>;
                    }
                    if (line.startsWith('- ')) return <li key={i} className="text-sm text-muted">{line.replace('- ', '')}</li>;
                    if (line.startsWith('```') || line.trim() === '') return <br key={i} />;
                    return <p key={i} className="text-sm text-muted leading-relaxed">{line}</p>;
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted italic">No instructions provided for this skill.</p>
              )}
            </Card>

            {skill.required_models && skill.required_models.length > 0 && (
              <Card>
                <h3 className="text-sm font-semibold text-foreground mb-3">Required Models</h3>
                <div className="flex flex-wrap gap-2">
                  {skill.required_models.map((m) => (
                    <span key={m} className="px-2.5 py-1 rounded-lg bg-surface border border-border text-xs font-mono text-foreground">{m}</span>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3">Metadata</h3>
              <dl className="space-y-3">
                {[
                  { label: 'Skill ID', value: skill.skill_id },
                  { label: 'Category', value: category },
                  { label: 'Version', value: `v${skill.version || '1.0.0'}` },
                  { label: 'Status', value: statusLabel },
                  { label: 'Assigned Users', value: String(skill.assignment_count ?? 0) },
                  ...(skill.created_at ? [{ label: 'Created', value: new Date(skill.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }] : []),
                  ...(lastModified ? [{ label: 'Last Modified', value: new Date(lastModified).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="text-sm font-medium text-foreground font-mono truncate max-w-[150px]" title={value}>{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3">Quick Assign</h3>
              <p className="text-xs text-muted mb-3">Assign this skill to users and teams from the Assignments tab.</p>
              <Button size="sm" className="w-full" icon={<Users className="w-4 h-4" />} onClick={() => setActiveTab('assignments')}>Open Assignments</Button>
            </Card>

          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-col h-[500px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <EmptyState
                  icon={<MessageSquare className="w-8 h-8" />}
                  title={`Test ${skill.display_name}`}
                  description="Send a message to see how this skill responds in real time."
                />
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : msg.error
                      ? 'bg-error/10 text-error border border-error/20'
                      : 'bg-surface text-foreground'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  placeholder={`Ask ${skill.display_name} a question...`}
                  disabled={chatLoading}
                  className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                  aria-label="Chat input"
                />
                <Button
                  size="sm"
                  icon={chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || chatLoading}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'assignments' && (
        <Card>
          {loadingAccess ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading assignments...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3 bg-surface space-y-2">
                <p className="text-xs font-semibold text-foreground">Current Assignments</p>
                <div className="flex flex-wrap gap-2">
                  {(access?.user_ids || []).map((userId) => (
                    <span key={`u-${userId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                      {users.find((user) => user.user_id === userId)?.display_name || userId}
                      <button onClick={() => void handleRemoveAssignment('user', userId)} className="text-muted hover:text-error">×</button>
                    </span>
                  ))}
                  {(access?.team_ids || []).map((teamId) => (
                    <span key={`t-${teamId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                      {teams.find((team) => team.team_id === teamId)?.name || teamId}
                      <button onClick={() => void handleRemoveAssignment('team', teamId)} className="text-muted hover:text-error">×</button>
                    </span>
                  ))}
                  {(!access || ((access.user_ids.length + access.team_ids.length) === 0)) && (
                    <span className="text-xs text-muted">No assignments yet</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Add Users</h4>
                  <div className="max-h-44 overflow-auto rounded-lg border border-border p-2 space-y-1">
                    {users.map((user) => (
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
                  <h4 className="text-sm font-semibold text-foreground mb-2">Add Teams</h4>
                  <div className="max-h-44 overflow-auto rounded-lg border border-border p-2 space-y-1">
                    {teams.map((team) => (
                      <label key={team.team_id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTeams.includes(team.team_id)}
                          onChange={() => setSelectedTeams((prev) => toggleInArray(prev, team.team_id))}
                        />
                        <span>{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button disabled={savingAccess} icon={savingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined} onClick={handleAddAssignments}>
                  {savingAccess ? 'Adding...' : 'Add Selected'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
