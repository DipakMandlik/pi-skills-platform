import React, { useState } from 'react';
import { useStore } from '../../store';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Stakeholder, KPIDefinition, SourceSystem } from '../../types';

const STEPS = [
  { key: 'goals', label: 'Business Goals', icon: 'Target' },
  { key: 'stakeholders', label: 'Stakeholders', icon: 'Users' },
  { key: 'kpis', label: 'KPIs', icon: 'BarChart3' },
  { key: 'sources', label: 'Source Systems', icon: 'Database' },
  { key: 'review', label: 'Review', icon: 'Eye' },
] as const;

type StepKey = typeof STEPS[number]['key'];

export function ProjectCanvas() {
  const { projects, activeProjectId, updateProject, addStakeholder, removeStakeholder, addKPI, removeKPI, addSourceSystem, removeSourceSystem, setViewMode } = useStore();
  const [step, setStep] = useState<StepKey>('goals');
  const project = projects.find(p => p.id === activeProjectId);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Icons.FolderKanban className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-display font-semibold text-text-main mb-2">No Project Selected</h2>
          <p className="text-sm text-text-muted">Create a project from the header to get started.</p>
        </div>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === step);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-10">
          {STEPS.map((s, i) => {
            const StepIcon = Icons[s.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
            const isActive = s.key === step;
            const isPast = i < currentStepIndex;
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <div className={`flex-1 h-px ${isPast ? 'bg-accent' : 'bg-border'}`} />}
                <button
                  onClick={() => setStep(s.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold'
                      : isPast
                      ? 'text-accent hover:bg-accent/5'
                      : 'text-text-muted hover:text-text-main hover:bg-bg-base'
                  }`}
                >
                  <StepIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'goals' && <GoalsStep project={project} onUpdate={updateProject} />}
            {step === 'stakeholders' && <StakeholdersStep project={project} onAdd={addStakeholder} onRemove={removeStakeholder} />}
            {step === 'kpis' && <KPIsStep project={project} onAdd={addKPI} onRemove={removeKPI} />}
            {step === 'sources' && <SourcesStep project={project} onAdd={addSourceSystem} onRemove={removeSourceSystem} />}
            {step === 'review' && <ReviewStep project={project} onOpenStories={() => setViewMode('story-board')} />}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
          <button
            onClick={() => setStep(STEPS[Math.max(0, currentStepIndex - 1)].key)}
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Icons.ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {currentStepIndex + 1} of {STEPS.length}
          </span>
          <button
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, currentStepIndex + 1)].key)}
            disabled={currentStepIndex === STEPS.length - 1}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <Icons.ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GOALS STEP ──

function GoalsStep({ project, onUpdate }: { project: any; onUpdate: (id: string, patch: any) => void }) {
  const [newGoal, setNewGoal] = useState('');

  const addGoal = () => {
    if (!newGoal.trim()) return;
    onUpdate(project.id, { businessGoals: [...project.businessGoals, newGoal.trim()] });
    setNewGoal('');
  };

  const removeGoal = (index: number) => {
    onUpdate(project.id, { businessGoals: project.businessGoals.filter((_: string, i: number) => i !== index) });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-text-main mb-1">Business Goals</h2>
      <p className="text-sm text-text-muted mb-8">What business problems is this project solving? Be specific about outcomes, not features.</p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-text-muted mb-2">Project Name</label>
          <input
            value={project.name}
            onChange={e => onUpdate(project.id, { name: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-base border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
            placeholder="e.g., Customer 360 Analytics Platform"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-text-muted mb-2">Description</label>
          <textarea
            value={project.description}
            onChange={e => onUpdate(project.id, { description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 bg-bg-base border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors resize-none"
            placeholder="Brief summary of what this project delivers and why it matters..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-text-muted mb-2">Business Goals</label>
        <div className="space-y-2 mb-3">
          {project.businessGoals.map((goal: string, i: number) => (
            <div key={i} className="flex items-center gap-2 group">
              <Icons.Target className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="flex-1 text-sm text-text-main">{goal}</span>
              <button onClick={() => removeGoal(i)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                <Icons.X className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newGoal}
            onChange={e => setNewGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGoal(); }}
            className="flex-1 px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
            placeholder="e.g., Reduce customer churn by 15% through early warning signals"
          />
          <button onClick={addGoal} disabled={!newGoal.trim()} className="p-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-30 transition-colors">
            <Icons.Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── STAKEHOLDERS STEP ──

function StakeholdersStep({ project, onAdd, onRemove }: { project: any; onAdd: (pid: string, s: Omit<Stakeholder, 'id'>) => void; onRemove: (pid: string, sid: string) => void }) {
  const [form, setForm] = useState({ name: '', role: '', email: '' });

  const handleAdd = () => {
    if (!form.name.trim() || !form.role.trim()) return;
    onAdd(project.id, { name: form.name.trim(), role: form.role.trim(), email: form.email.trim() });
    setForm({ name: '', role: '', email: '' });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-text-main mb-1">Stakeholders</h2>
      <p className="text-sm text-text-muted mb-8">Who needs to be involved? Business owners, technical leads, and end users.</p>

      {project.stakeholders.length > 0 && (
        <div className="mb-6 border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-base">
                <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-text-muted">Name</th>
                <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-text-muted">Role</th>
                <th className="px-4 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-text-muted">Email</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {project.stakeholders.map((s: Stakeholder) => (
                <tr key={s.id} className="border-t border-border group">
                  <td className="px-4 py-2.5 text-sm text-text-main">{s.name}</td>
                  <td className="px-4 py-2.5 text-sm text-text-muted">{s.role}</td>
                  <td className="px-4 py-2.5 text-sm text-text-muted">{s.email || '—'}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => onRemove(project.id, s.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                      <Icons.X className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-3">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name *" className="px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
        <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role *" className="px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
      </div>
      <button onClick={handleAdd} disabled={!form.name.trim() || !form.role.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 disabled:opacity-30 transition-colors">
        <Icons.Plus className="w-4 h-4" />
        Add Stakeholder
      </button>
    </div>
  );
}

// ── KPI STEP ──

function KPIsStep({ project, onAdd, onRemove }: { project: any; onAdd: (pid: string, kpi: Omit<KPIDefinition, 'id'>) => void; onRemove: (pid: string, kid: string) => void }) {
  const [form, setForm] = useState({ name: '', description: '', formula: '', target: '', frequency: 'monthly' as KPIDefinition['frequency'] });

  const handleAdd = () => {
    if (!form.name.trim()) return;
    onAdd(project.id, { name: form.name.trim(), description: form.description.trim(), formula: form.formula.trim(), target: form.target.trim(), frequency: form.frequency });
    setForm({ name: '', description: '', formula: '', target: '', frequency: 'monthly' });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-text-main mb-1">KPI Definitions</h2>
      <p className="text-sm text-text-muted mb-8">Define measurable success criteria. Every KPI must have a formula and a target.</p>

      {project.kpis.length > 0 && (
        <div className="space-y-3 mb-6">
          {project.kpis.map((kpi: KPIDefinition) => (
            <div key={kpi.id} className="p-4 bg-bg-base border border-border rounded-lg group">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-text-main">{kpi.name}</h4>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-accent">{kpi.frequency}</span>
                </div>
                <button onClick={() => onRemove(project.id, kpi.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                  <Icons.X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
              {kpi.description && <p className="text-xs text-text-muted mb-2">{kpi.description}</p>}
              <div className="flex items-center gap-4 text-xs">
                {kpi.formula && <span className="font-mono text-text-muted">Formula: <span className="text-text-main">{kpi.formula}</span></span>}
                {kpi.target && <span className="font-mono text-text-muted">Target: <span className="text-text-main">{kpi.target}</span></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-bg-base border border-border rounded-lg space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="KPI Name *" className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
          <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value as KPIDefinition['frequency'] })} className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </div>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
        <div className="grid grid-cols-2 gap-3">
          <input value={form.formula} onChange={e => setForm({ ...form, formula: e.target.value })} placeholder="Formula (e.g., SUM(revenue) / COUNT(customers))" className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
          <input value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="Target (e.g., > $1M ARR)" className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
        </div>
        <button onClick={handleAdd} disabled={!form.name.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 disabled:opacity-30 transition-colors">
          <Icons.Plus className="w-4 h-4" />
          Add KPI
        </button>
      </div>
    </div>
  );
}

// ── SOURCES STEP ──

function SourcesStep({ project, onAdd, onRemove }: { project: any; onAdd: (pid: string, src: Omit<SourceSystem, 'id'>) => void; onRemove: (pid: string, sid: string) => void }) {
  const [form, setForm] = useState({ name: '', type: 'database' as SourceSystem['type'], description: '', owner: '', sla: '', connectivity: 'pending' as SourceSystem['connectivity'], pii: false });

  const handleAdd = () => {
    if (!form.name.trim()) return;
    onAdd(project.id, { name: form.name.trim(), type: form.type, description: form.description.trim(), owner: form.owner.trim(), sla: form.sla.trim() || undefined, connectivity: form.connectivity, pii: form.pii });
    setForm({ name: '', type: 'database', description: '', owner: '', sla: '', connectivity: 'pending', pii: false });
  };

  const typeIcons: Record<string, string> = { database: 'Database', api: 'Globe', file: 'FileText', saas: 'Cloud', other: 'Box' };
  const typeColors: Record<string, string> = { database: 'text-accent', api: 'text-accent-secondary', file: 'text-amber-500', saas: 'text-purple-500', other: 'text-text-muted' };
  const statusColors: Record<string, string> = { available: 'text-green-600 bg-green-50', pending: 'text-amber-600 bg-amber-50', blocked: 'text-red-600 bg-red-50' };

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-text-main mb-1">Source Systems</h2>
      <p className="text-sm text-text-muted mb-8">Inventory every system that produces or holds data for this project. Flag PII early.</p>

      {project.sourceSystems.length > 0 && (
        <div className="space-y-2 mb-6">
          {project.sourceSystems.map((src: SourceSystem) => {
            const IconComp = Icons[typeIcons[src.type] as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
            return (
              <div key={src.id} className="flex items-center gap-3 p-3 bg-bg-base border border-border rounded-lg group">
                <IconComp className={`w-5 h-5 flex-shrink-0 ${typeColors[src.type]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-main">{src.name}</span>
                    {src.pii && <span className="text-[9px] font-mono px-1.5 py-0.5 bg-red-50 text-red-500 rounded uppercase tracking-wider">PII</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase">{src.type}</span>
                    {src.owner && <span className="text-[10px] text-text-muted">Owner: {src.owner}</span>}
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${statusColors[src.connectivity]}`}>{src.connectivity}</span>
                <button onClick={() => onRemove(project.id, src.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all">
                  <Icons.X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-4 bg-bg-base border border-border rounded-lg space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="System Name *" className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as SourceSystem['type'] })} className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors">
            <option value="database">Database</option>
            <option value="api">API</option>
            <option value="file">File</option>
            <option value="saas">SaaS</option>
            <option value="other">Other</option>
          </select>
          <select value={form.connectivity} onChange={e => setForm({ ...form, connectivity: e.target.value as SourceSystem['connectivity'] })} className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors">
            <option value="available">Available</option>
            <option value="pending">Pending</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
        <div className="grid grid-cols-3 gap-3">
          <input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="Owner" className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
          <input value={form.sla} onChange={e => setForm({ ...form, sla: e.target.value })} placeholder="SLA (e.g., 99.9% uptime)" className="px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors" />
          <label className="flex items-center gap-2 px-3 py-2 bg-panel border border-border rounded-lg cursor-pointer">
            <input type="checkbox" checked={form.pii} onChange={e => setForm({ ...form, pii: e.target.checked })} className="rounded border-border text-accent focus:ring-accent" />
            <span className="text-sm text-text-muted">Contains PII</span>
          </label>
        </div>
        <button onClick={handleAdd} disabled={!form.name.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 disabled:opacity-30 transition-colors">
          <Icons.Plus className="w-4 h-4" />
          Add Source System
        </button>
      </div>
    </div>
  );
}

// ── REVIEW STEP ──

function ReviewStep({ project, onOpenStories }: { project: any; onOpenStories: () => void }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-text-main mb-1">Project Canvas Review</h2>
      <p className="text-sm text-text-muted mb-8">Review your project intake before moving to story building. Everything here feeds into downstream phases.</p>

      <div className="space-y-6">
        {/* Summary card */}
        <div className="p-5 bg-bg-base border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Icons.FolderKanban className="w-5 h-5 text-accent" />
            <h3 className="font-display font-semibold text-text-main">{project.name || 'Untitled Project'}</h3>
          </div>
          {project.description && <p className="text-sm text-text-muted mb-4">{project.description}</p>}
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 bg-panel rounded-lg border border-border">
              <div className="text-2xl font-display font-bold text-accent">{project.businessGoals.length}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Goals</div>
            </div>
            <div className="text-center p-3 bg-panel rounded-lg border border-border">
              <div className="text-2xl font-display font-bold text-accent">{project.stakeholders.length}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Stakeholders</div>
            </div>
            <div className="text-center p-3 bg-panel rounded-lg border border-border">
              <div className="text-2xl font-display font-bold text-accent">{project.kpis.length}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">KPIs</div>
            </div>
            <div className="text-center p-3 bg-panel rounded-lg border border-border">
              <div className="text-2xl font-display font-bold text-accent">{project.sourceSystems.length}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Sources</div>
            </div>
          </div>
        </div>

        {/* Goals */}
        {project.businessGoals.length > 0 && (
          <div className="p-4 bg-bg-base border border-border rounded-lg">
            <h4 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">Business Goals</h4>
            <ul className="space-y-1.5">
              {project.businessGoals.map((g: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-main">
                  <Icons.Target className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PII warning */}
        {project.sourceSystems.some((s: SourceSystem) => s.pii) && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <Icons.ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-700">PII Detected</h4>
              <p className="text-xs text-red-600 mt-0.5">
                {project.sourceSystems.filter((s: SourceSystem) => s.pii).map((s: SourceSystem) => s.name).join(', ')} contain(s) personally identifiable information.
                Data contracts and access controls should be established before development begins.
              </p>
            </div>
          </div>
        )}

        {/* Readiness */}
        <div className="p-4 bg-bg-base border border-border rounded-lg">
          <h4 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">Readiness Assessment</h4>
          <div className="space-y-2">
            <ReadinessRow label="Business goals defined" ok={project.businessGoals.length > 0} />
            <ReadinessRow label="Stakeholders identified" ok={project.stakeholders.length > 0} />
            <ReadinessRow label="KPIs defined" ok={project.kpis.length > 0} />
            <ReadinessRow label="Source systems inventoried" ok={project.sourceSystems.length > 0} />
            <ReadinessRow label="All sources available or pending" ok={project.sourceSystems.every((s: SourceSystem) => s.connectivity !== 'blocked')} />
          </div>
        </div>

        {/* CTA */}
        <button onClick={onOpenStories} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors">
          <Icons.ListChecks className="w-4 h-4" />
          Continue to Story Board
        </button>
      </div>
    </div>
  );
}

function ReadinessRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <Icons.CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Icons.Circle className="w-4 h-4 text-text-muted/30" />
      )}
      <span className={`text-sm ${ok ? 'text-text-main' : 'text-text-muted'}`}>{label}</span>
    </div>
  );
}
