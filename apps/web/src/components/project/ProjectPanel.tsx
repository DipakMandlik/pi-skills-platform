import React, { useState } from 'react';
import { useStore } from '../../store';
import * as Icons from 'lucide-react';
import type { ProjectPhase, Stakeholder, KPIDefinition, SourceSystem } from '../../types';

type Tab = 'canvas' | 'stories' | 'workflow';

const PHASES: { key: ProjectPhase; label: string; icon: string }[] = [
  { key: 'discovery', label: 'Discovery', icon: 'Compass' },
  { key: 'architecture', label: 'Architecture', icon: 'Blocks' },
  { key: 'development', label: 'Development', icon: 'Code2' },
  { key: 'testing', label: 'Testing', icon: 'TestTube2' },
  { key: 'documentation', label: 'Docs', icon: 'BookOpen' },
  { key: 'deployment', label: 'Deploy', icon: 'Rocket' },
  { key: 'monitoring', label: 'Monitor', icon: 'Activity' },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-600' },
  high: { bg: 'bg-amber-50', text: 'text-amber-600' },
  medium: { bg: 'bg-[var(--color-accent-light)]', text: 'text-[var(--color-accent)]' },
  low: { bg: 'bg-gray-50', text: 'text-gray-500' },
};

export function ProjectPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const store = useStore();
  const { projects, activeProjectId, updateProject, addStakeholder, removeStakeholder, addKPI, removeKPI, addSourceSystem, removeSourceSystem, addUserStory, removeUserStory, updateProjectPhase, createProject } = store;
  const project = projects.find(p => p.id === activeProjectId);

  const [tab, setTab] = useState<Tab>('canvas');
  const [quickStory, setQuickStory] = useState('');

  if (!project) {
    if (!isOpen) return null;
    return (
      <div className="h-full w-[380px] bg-white border-l border-gray-200 shrink-0 flex items-center justify-center p-8">
        <div className="text-center">
          <Icons.FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No Project Selected</h3>
          <p className="text-sm text-gray-400 mb-4">Create a project from the sidebar to get started</p>
          <button
            onClick={() => createProject({
              name: 'New Project',
              description: '',
              businessGoals: [],
              stakeholders: [],
              kpis: [],
              sourceSystems: [],
              userStories: [],
              currentPhase: 'discovery',
            })}
             className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-accent-hover)] mx-auto transition-colors shadow-sm"
          >
            <Icons.Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="h-full w-[400px] bg-white border-l border-gray-200 shrink-0 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
           <Icons.FolderKanban className="w-4 h-4 text-[var(--color-accent)]" />
          <span className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">{project.name}</span>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
          <Icons.X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 shrink-0 bg-white">
        {([
          { key: 'canvas' as Tab, label: 'Canvas', icon: 'LayoutDashboard' },
          { key: 'stories' as Tab, label: 'Stories', icon: 'ListChecks' },
          { key: 'workflow' as Tab, label: 'Workflow', icon: 'GitBranch' },
        ]).map(t => {
          const TabIcon = Icons[t.icon as keyof typeof Icons] as any;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all ${
                tab === t.key
                  ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] bg-[var(--color-accent-light)]/50'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'canvas' && <CanvasTab project={project} onUpdate={updateProject} onAddStakeholder={addStakeholder} onRemoveStakeholder={removeStakeholder} onAddKPI={addKPI} onRemoveKPI={removeKPI} onAddSource={addSourceSystem} onRemoveSource={removeSourceSystem} />}
        {tab === 'stories' && <StoriesTab project={project} quickStory={quickStory} setQuickStory={setQuickStory} onAddStory={addUserStory} onRemoveStory={removeUserStory} />}
        {tab === 'workflow' && <WorkflowTab project={project} onUpdatePhase={updateProjectPhase} />}
      </div>
    </div>
  );
}

// ── CANVAS TAB ──

function CanvasTab({ project, onUpdate, onAddStakeholder, onRemoveStakeholder, onAddKPI, onRemoveKPI, onAddSource, onRemoveSource }: any) {
  const [newGoal, setNewGoal] = useState('');
  const [stakeForm, setStakeForm] = useState({ name: '', role: '', email: '' });
  const [kpiForm, setKpiForm] = useState({ name: '', formula: '', target: '', frequency: 'monthly' });

  const addGoal = () => {
    if (!newGoal.trim()) return;
    onUpdate(project.id, { businessGoals: [...project.businessGoals, newGoal.trim()] });
    setNewGoal('');
  };

  const addStakeholder = () => {
    if (!stakeForm.name.trim()) return;
    onAddStakeholder(project.id, { name: stakeForm.name.trim(), role: stakeForm.role.trim(), email: stakeForm.email.trim() });
    setStakeForm({ name: '', role: '', email: '' });
  };

  const addKPI = () => {
    if (!kpiForm.name.trim()) return;
    onAddKPI(project.id, { name: kpiForm.name.trim(), description: '', formula: kpiForm.formula.trim(), target: kpiForm.target.trim(), frequency: kpiForm.frequency });
    setKpiForm({ name: '', formula: '', target: '', frequency: 'monthly' });
  };

  return (
    <div className="p-5 space-y-6">
      {/* Description */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">Description</label>
        <textarea
          value={project.description}
          onChange={e => onUpdate(project.id, { description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white resize-none transition-colors"
          placeholder="What is this project about?"
        />
      </div>

      {/* Goals */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">Business Goals</label>
        {project.businessGoals.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {project.businessGoals.map((g: string, i: number) => (
              <div key={i} className="flex items-center gap-2 group px-3 py-2 bg-[var(--color-accent-light)] rounded-lg">
                <Icons.Target className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                <span className="flex-1 text-sm text-gray-700">{g}</span>
                <button onClick={() => onUpdate(project.id, { businessGoals: project.businessGoals.filter((_: string, idx: number) => idx !== i) })} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--color-accent-light)] rounded transition-all">
                  <Icons.X className="w-3.5 h-3.5 text-[var(--color-accent);opacity-0.8]" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newGoal}
            onChange={e => setNewGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGoal(); }}
            placeholder="Add a business goal..."
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:bg-white placeholder:text-gray-400 transition-colors"
          />
          <button onClick={addGoal} disabled={!newGoal.trim()} className="px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-30 transition-colors">
            <Icons.Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stakeholders */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">Stakeholders</label>
        {project.stakeholders.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {project.stakeholders.map((s: Stakeholder) => (
              <div key={s.id} className="flex items-center gap-2 group px-3 py-2 bg-gray-50 rounded-lg">
                <Icons.User className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-700 block">{s.name}</span>
                  {s.role && <span className="text-xs text-gray-400">{s.role}</span>}
                </div>
                <button onClick={() => onRemoveStakeholder(project.id, s.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                  <Icons.X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <input value={stakeForm.name} onChange={e => setStakeForm({ ...stakeForm, name: e.target.value })} placeholder="Name" className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 transition-colors" />
          <input value={stakeForm.role} onChange={e => setStakeForm({ ...stakeForm, role: e.target.value })} placeholder="Role" className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 transition-colors" />
          <button onClick={addStakeholder} disabled={!stakeForm.name.trim()} className="px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-30 transition-colors">
            Add
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">KPIs</label>
        {project.kpis.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {project.kpis.map((k: KPIDefinition) => (
              <div key={k.id} className="group px-3 py-2 bg-emerald-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{k.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-600 uppercase bg-emerald-100 px-1.5 py-0.5 rounded">{k.frequency}</span>
                    <button onClick={() => onRemoveKPI(project.id, k.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-emerald-100 rounded transition-all">
                      <Icons.X className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  </div>
                </div>
                {(k.formula || k.target) && (
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    {k.formula && <span>Formula: {k.formula}</span>}
                    {k.formula && k.target && <span className="mx-1">·</span>}
                    {k.target && <span>Target: {k.target}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <input value={kpiForm.name} onChange={e => setKpiForm({ ...kpiForm, name: e.target.value })} placeholder="KPI name" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 transition-colors" />
          <div className="grid grid-cols-2 gap-2">
            <input value={kpiForm.formula} onChange={e => setKpiForm({ ...kpiForm, formula: e.target.value })} placeholder="Formula" className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 transition-colors" />
            <input value={kpiForm.target} onChange={e => setKpiForm({ ...kpiForm, target: e.target.value })} placeholder="Target" className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 transition-colors" />
          </div>
          <button onClick={addKPI} disabled={!kpiForm.name.trim()} className="w-full px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-30 transition-colors">
            Add KPI
          </button>
        </div>
      </div>

      {/* Source Systems */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">Source Systems</label>
        {project.sourceSystems.length > 0 ? (
          <div className="space-y-1.5">
            {project.sourceSystems.map((s: SourceSystem) => (
              <div key={s.id} className="flex items-center gap-2 group px-3 py-2 bg-gray-50 rounded-lg">
                <Icons.Database className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="flex-1 text-sm text-gray-700">{s.name}</span>
                {s.pii && <span className="text-[10px] font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded">PII</span>}
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${s.connectivity === 'available' ? 'text-emerald-600 bg-emerald-50' : s.connectivity === 'pending' ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'}`}>{s.connectivity}</span>
                <button onClick={() => onRemoveSource(project.id, s.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                  <Icons.X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">No sources added yet</p>
        )}
      </div>

      {/* Readiness */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-3">Readiness Checklist</label>
        <div className="space-y-2">
          <ReadinessRow label="Business goals defined" ok={project.businessGoals.length > 0} />
          <ReadinessRow label="Stakeholders identified" ok={project.stakeholders.length > 0} />
          <ReadinessRow label="KPIs defined" ok={project.kpis.length > 0} />
          <ReadinessRow label="Sources inventoried" ok={project.sourceSystems.length > 0} />
        </div>
      </div>
    </div>
  );
}

function ReadinessRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {ok ? <Icons.CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Icons.Circle className="w-4 h-4 text-gray-300" />}
      <span className={ok ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
    </div>
  );
}

// ── STORIES TAB ──

function StoriesTab({ project, quickStory, setQuickStory, onAddStory, onRemoveStory }: any) {
  const handleQuickAdd = () => {
    if (!quickStory.trim()) return;
    const match = quickStory.match(/as\s+(?:a|an)\s+(.+?),\s*i\s+want\s+(.+?)(?:,?\s*so\s+that\s+(.+))?$/i);
    if (match) {
      onAddStory(project.id, { role: match[1].trim(), feature: match[2].trim(), benefit: (match[3] || '').trim(), acceptanceCriteria: [], priority: 'medium' });
    } else {
      onAddStory(project.id, { role: '', feature: quickStory.trim(), benefit: '', acceptanceCriteria: [], priority: 'medium' });
    }
    setQuickStory('');
  };

  const grouped = {
    critical: project.userStories.filter((s: any) => s.priority === 'critical'),
    high: project.userStories.filter((s: any) => s.priority === 'high'),
    medium: project.userStories.filter((s: any) => s.priority === 'medium'),
    low: project.userStories.filter((s: any) => s.priority === 'low'),
  };

  return (
    <div className="p-5">
      {/* Quick add */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-400 transition-colors">
          <Icons.Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            value={quickStory}
            onChange={e => setQuickStory(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
            placeholder='As a user, I want...'
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400"
          />
        </div>
        <button onClick={handleQuickAdd} disabled={!quickStory.trim()} className="p-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-30 transition-colors shadow-sm">
          <Icons.Plus className="w-4 h-4" />
        </button>
      </div>

      {project.userStories.length === 0 ? (
        <div className="text-center py-12">
          <Icons.ListChecks className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No stories yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {(['critical', 'high', 'medium', 'low'] as const).map(priority => {
            const stories = grouped[priority];
            if (stories.length === 0) return null;
            const colors = PRIORITY_COLORS[priority];
            return (
              <div key={priority}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>{priority}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[10px] font-mono text-gray-400">{stories.length}</span>
                </div>
                <div className="space-y-1.5">
                  {stories.map((story: any) => (
                    <div key={story.id} className={`px-3 py-2.5 ${colors.bg} rounded-lg group`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {story.role && <div className="text-[10px] font-mono text-gray-500 uppercase mb-0.5">As a <span className={`font-semibold ${colors.text}`}>{story.role}</span></div>}
                          <div className="text-sm text-gray-700 font-medium">{story.feature}</div>
                          {story.benefit && <div className="text-xs text-gray-500 mt-0.5">So that {story.benefit}</div>}
                        </div>
                        <button onClick={() => onRemoveStory(project.id, story.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/60 rounded transition-all shrink-0 ml-2">
                          <Icons.Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── WORKFLOW TAB ──

function WorkflowTab({ project, onUpdatePhase }: any) {
  const currentPhaseIndex = PHASES.findIndex(p => p.key === project.currentPhase);

  return (
    <div className="p-5">
      <p className="text-sm text-gray-500 mb-5">Track your project's progress through the data engineering lifecycle.</p>

      <div className="space-y-1.5">
        {PHASES.map((phase, i) => {
          const PhaseIcon = Icons[phase.icon as keyof typeof Icons] as any;
          const isActive = i === currentPhaseIndex;
          const isPast = i < currentPhaseIndex;
          const isFuture = i > currentPhaseIndex;

          return (
            <button
              key={phase.key}
              onClick={() => onUpdatePhase(project.id, phase.key)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                isActive
                  ? 'bg-blue-50 border-2 border-blue-200'
                  : isPast
                  ? 'bg-gray-50 border-2 border-transparent'
                  : 'hover:bg-gray-50 border-2 border-transparent'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isActive
                  ? 'bg-blue-500 text-white shadow-sm'
                  : isPast
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {isPast ? <Icons.Check className="w-5 h-5" /> : <PhaseIcon className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${isActive ? 'text-blue-700' : isFuture ? 'text-gray-400' : 'text-gray-700'}`}>
                  {phase.label}
                </div>
                <div className="text-xs text-gray-400">
                  {isActive ? 'Current phase' : isPast ? 'Completed' : 'Upcoming'}
                </div>
              </div>
              {isActive && (
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">ACTIVE</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 text-center">
          <div className="text-2xl font-bold text-blue-600">{project.userStories.length}</div>
          <div className="text-[10px] font-mono uppercase text-blue-500 mt-0.5">Stories</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-center">
          <div className="text-2xl font-bold text-emerald-600">{project.sourceSystems.length}</div>
          <div className="text-[10px] font-mono uppercase text-emerald-500 mt-0.5">Sources</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 text-center">
          <div className="text-2xl font-bold text-purple-600">{project.kpis.length}</div>
          <div className="text-[10px] font-mono uppercase text-purple-500 mt-0.5">KPIs</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-center">
          <div className="text-2xl font-bold text-amber-600">{currentPhaseIndex + 1}/{PHASES.length}</div>
          <div className="text-[10px] font-mono uppercase text-amber-500 mt-0.5">Progress</div>
        </div>
      </div>
    </div>
  );
}
