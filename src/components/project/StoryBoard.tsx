import React, { useState } from 'react';
import { useStore } from '../../store';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { UserStory } from '../../types';

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  high: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  low: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
};

export function StoryBoard() {
  const { projects, activeProjectId, addUserStory, updateUserStory, removeUserStory } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const project = projects.find(p => p.id === activeProjectId);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Icons.ListChecks className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-display font-semibold text-text-main mb-2">No Project Selected</h2>
          <p className="text-sm text-text-muted">Create a project first to start building user stories.</p>
        </div>
      </div>
    );
  }

  const handleQuickAdd = () => {
    if (!quickInput.trim()) return;
    // Parse "As a [role], I want [feature], so that [benefit]" pattern
    const match = quickInput.match(/as\s+(?:a|an)\s+(.+?),\s*i\s+want\s+(.+?)(?:,?\s*so\s+that\s+(.+))?$/i);
    if (match) {
      addUserStory(project.id, {
        role: match[1].trim(),
        feature: match[2].trim(),
        benefit: (match[3] || '').trim(),
        acceptanceCriteria: [],
        priority: 'medium',
      });
    } else {
      // Fallback: treat the whole input as the feature
      addUserStory(project.id, {
        role: '',
        feature: quickInput.trim(),
        benefit: '',
        acceptanceCriteria: [],
        priority: 'medium',
      });
    }
    setQuickInput('');
  };

  const grouped = {
    critical: project.userStories.filter(s => s.priority === 'critical'),
    high: project.userStories.filter(s => s.priority === 'high'),
    medium: project.userStories.filter(s => s.priority === 'medium'),
    low: project.userStories.filter(s => s.priority === 'low'),
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-display text-xl font-semibold text-text-main mb-1">Story Board</h2>
            <p className="text-sm text-text-muted">
              {project.userStories.length} {project.userStories.length === 1 ? 'story' : 'stories'} for {project.name}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
          >
            <Icons.Plus className="w-4 h-4" />
            New Story
          </button>
        </div>

        {/* Quick input */}
        <div className="mb-8">
          <div className="flex items-center gap-2 p-3 bg-bg-base border border-border rounded-lg focus-within:border-accent transition-colors">
            <Icons.Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
            <input
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
              placeholder='Quick add: "As a sales manager, I want daily revenue by region, so that I can track quota attainment"'
              className="flex-1 text-sm bg-transparent text-text-main placeholder:text-text-muted focus:outline-none"
            />
            <button onClick={handleQuickAdd} disabled={!quickInput.trim()} className="p-1.5 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-30">
              <Icons.ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] font-mono text-text-muted mt-1.5 ml-1">Type in "As a [role], I want [feature], so that [benefit]" format for automatic parsing</p>
        </div>

        {/* Full form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-8"
            >
              <StoryForm
                projectId={project.id}
                kpis={project.kpis}
                sourceSystems={project.sourceSystems}
                onAdd={(story) => { addUserStory(project.id, story); setShowForm(false); }}
                onCancel={() => setShowForm(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit form */}
        <AnimatePresence>
          {editingId && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-8"
            >
              <StoryForm
                projectId={project.id}
                kpis={project.kpis}
                sourceSystems={project.sourceSystems}
                initial={project.userStories.find(s => s.id === editingId)}
                onUpdate={(patch) => { updateUserStory(project.id, editingId, patch); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stories grouped by priority */}
        <div className="space-y-8">
          {(['critical', 'high', 'medium', 'low'] as const).map(priority => {
            const stories = grouped[priority];
            if (stories.length === 0) return null;
            const colors = PRIORITY_COLORS[priority];
            return (
              <div key={priority}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${colors.text}`}>{priority}</span>
                  <div className={`flex-1 h-px ${colors.border} border-t`} />
                  <span className="text-[10px] font-mono text-text-muted">{stories.length}</span>
                </div>
                <div className="space-y-2">
                  {stories.map(story => {
                    const cardColors = PRIORITY_COLORS[story.priority];
                    return (
                    <div key={story.id} className={`p-4 ${cardColors.bg} border ${cardColors.border} rounded-lg group`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          {story.role && (
                            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
                              As a <span className={`font-semibold ${cardColors.text}`}>{story.role}</span>
                            </div>
                          )}
                          <h4 className="text-sm font-medium text-text-main">{story.feature}</h4>
                          {story.benefit && <p className="text-xs text-text-muted mt-1">So that {story.benefit}</p>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingId(story.id)} className="p-1.5 hover:bg-white/60 rounded transition-colors">
                            <Icons.Pencil className="w-3.5 h-3.5 text-text-muted" />
                          </button>
                          <button onClick={() => removeUserStory(project.id, story.id)} className="p-1.5 hover:bg-red-100 rounded transition-colors">
                            <Icons.Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>
                      {story.acceptanceCriteria.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted">Acceptance Criteria</div>
                          {story.acceptanceCriteria.map((ac, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-text-main">
                              <Icons.CheckSquare className="w-3 h-3 mt-0.5 text-text-muted flex-shrink-0" />
                              {ac}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        {story.linkedKPI && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-text-muted">
                            <Icons.BarChart3 className="w-3 h-3" />
                            {story.linkedKPI}
                          </span>
                        )}
                        {story.linkedSourceSystem && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-text-muted">
                            <Icons.Database className="w-3 h-3" />
                            {story.linkedSourceSystem}
                          </span>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {project.userStories.length === 0 && !showForm && (
          <div className="text-center py-16">
            <Icons.BookOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <h3 className="font-display font-semibold text-text-main mb-1">No stories yet</h3>
            <p className="text-sm text-text-muted">Add your first user story above or use the quick input.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── STORY FORM ──

function StoryForm({
  projectId,
  kpis,
  sourceSystems,
  initial,
  onAdd,
  onUpdate,
  onCancel,
}: {
  projectId: string;
  kpis: Array<{ id: string; name: string }>;
  sourceSystems: Array<{ id: string; name: string }>;
  initial?: UserStory;
  onAdd?: (story: Omit<UserStory, 'id'>) => void;
  onUpdate?: (patch: Partial<UserStory>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    role: initial?.role || '',
    feature: initial?.feature || '',
    benefit: initial?.benefit || '',
    acceptanceCriteria: initial?.acceptanceCriteria?.join('\n') || '',
    priority: initial?.priority || 'medium' as UserStory['priority'],
    linkedKPI: initial?.linkedKPI || '',
    linkedSourceSystem: initial?.linkedSourceSystem || '',
  });

  const handleSubmit = () => {
    if (!form.feature.trim()) return;
    const data = {
      role: form.role.trim(),
      feature: form.feature.trim(),
      benefit: form.benefit.trim(),
      acceptanceCriteria: form.acceptanceCriteria.split('\n').filter(s => s.trim()),
      priority: form.priority,
      linkedKPI: form.linkedKPI || undefined,
      linkedSourceSystem: form.linkedSourceSystem || undefined,
    };
    if (initial && onUpdate) onUpdate(data);
    else if (onAdd) onAdd(data);
  };

  return (
    <div className="p-5 bg-bg-base border border-border rounded-lg space-y-4">
      <h3 className="font-display font-semibold text-text-main">{initial ? 'Edit Story' : 'New User Story'}</h3>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">As a...</label>
          <input
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            placeholder="e.g., sales manager"
            className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">I want *</label>
          <input
            value={form.feature}
            onChange={e => setForm({ ...form, feature: e.target.value })}
            placeholder="e.g., daily revenue breakdown by product category"
            className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">So that...</label>
        <input
          value={form.benefit}
          onChange={e => setForm({ ...form, benefit: e.target.value })}
          placeholder="e.g., I can identify underperforming categories early"
          className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">Acceptance Criteria (one per line)</label>
        <textarea
          value={form.acceptanceCriteria}
          onChange={e => setForm({ ...form, acceptanceCriteria: e.target.value })}
          rows={3}
          placeholder="Data refreshes by 8am daily&#10;Revenue matches source system totals&#10;Breakdown includes all active product categories"
          className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">Priority</label>
          <select
            value={form.priority}
            onChange={e => setForm({ ...form, priority: e.target.value as UserStory['priority'] })}
            className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">Linked KPI</label>
          <select
            value={form.linkedKPI}
            onChange={e => setForm({ ...form, linkedKPI: e.target.value })}
            className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">None</option>
            {kpis.map(k => <option key={k.id} value={k.name}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5">Linked Source</label>
          <select
            value={form.linkedSourceSystem}
            onChange={e => setForm({ ...form, linkedSourceSystem: e.target.value })}
            className="w-full px-3 py-2 bg-panel border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">None</option>
            {sourceSystems.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button onClick={handleSubmit} disabled={!form.feature.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-30 transition-colors">
          <Icons.Check className="w-4 h-4" />
          {initial ? 'Update Story' : 'Add Story'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-text-muted hover:text-text-main transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
