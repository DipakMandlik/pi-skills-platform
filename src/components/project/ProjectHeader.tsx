import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ProjectPhase, ViewMode } from '../../types';

const PHASES: { key: ProjectPhase; label: string; icon: string }[] = [
  { key: 'discovery', label: 'Discovery', icon: 'Compass' },
  { key: 'architecture', label: 'Architecture', icon: 'Blocks' },
  { key: 'development', label: 'Development', icon: 'Code2' },
  { key: 'testing', label: 'Testing', icon: 'TestTube2' },
  { key: 'documentation', label: 'Docs', icon: 'BookOpen' },
  { key: 'deployment', label: 'Deploy', icon: 'Rocket' },
  { key: 'monitoring', label: 'Monitor', icon: 'Activity' },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'project-canvas', label: 'Canvas', icon: 'LayoutDashboard' },
  { key: 'story-board', label: 'Stories', icon: 'ListChecks' },
  { key: 'sql-workspace', label: 'SQL Workspace', icon: 'Terminal' },
];

export function ProjectHeader() {
  const { projects, activeProjectId, viewMode, setActiveProject, setViewMode, deleteProject, createProject } = useStore();
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const switcherRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
        setShowNewProject(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showNewProject && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewProject]);

  if (!activeProject) return null;

  const currentPhaseIndex = PHASES.findIndex(p => p.key === activeProject.currentPhase);

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    createProject({
      name: newProjectName.trim(),
      description: '',
      businessGoals: [],
      stakeholders: [],
      kpis: [],
      sourceSystems: [],
      userStories: [],
      currentPhase: 'discovery',
    });
    setNewProjectName('');
    setShowNewProject(false);
    setShowSwitcher(false);
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this project? This cannot be undone.')) {
      deleteProject(id);
      setShowSwitcher(false);
    }
  };

  return (
    <div className="h-10 bg-panel/80 backdrop-blur-sm border-b border-border flex items-center px-4 gap-3 shrink-0">
      {/* Project switcher */}
      <div className="relative" ref={switcherRef}>
        <button
          onClick={() => setShowSwitcher(!showSwitcher)}
          className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-bg-base transition-colors group"
        >
          <Icons.FolderKanban className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-medium font-display text-text-main truncate max-w-[180px]">
            {activeProject.name}
          </span>
          <Icons.ChevronDown className="w-3 h-3 text-text-muted group-hover:text-text-main transition-colors" />
        </button>

        <AnimatePresence>
          {showSwitcher && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1 w-72 bg-panel border border-border rounded-lg shadow-lg overflow-hidden z-50"
            >
              <div className="p-2 border-b border-border">
                <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted px-2 py-1">Projects</div>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {projects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => { setActiveProject(project.id); setShowSwitcher(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-base transition-colors group ${
                      project.id === activeProjectId ? 'bg-accent/5' : ''
                    }`}
                  >
                    <Icons.FolderKanban className={`w-4 h-4 flex-shrink-0 ${
                      project.id === activeProjectId ? 'text-accent' : 'text-text-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-main truncate">{project.name}</div>
                      <div className="text-[10px] font-mono text-text-muted uppercase">
                        {PHASES.find(p => p.key === project.currentPhase)?.label}
                      </div>
                    </div>
                    {project.id === activeProjectId && (
                      <Icons.Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all"
                    >
                      <Icons.Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-border">
                {showNewProject ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false); }}
                      placeholder="Project name..."
                      className="flex-1 text-sm px-2 py-1.5 bg-bg-base border border-border rounded focus:outline-none focus:border-accent text-text-main placeholder:text-text-muted"
                    />
                    <button onClick={handleCreateProject} className="p-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors">
                      <Icons.Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewProject(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-accent hover:bg-accent/5 rounded transition-colors"
                  >
                    <Icons.Plus className="w-3.5 h-3.5" />
                    New Project
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Phase breadcrumb */}
      <div className="flex items-center gap-0.5">
        {PHASES.map((phase, i) => {
          const PhaseIcon = Icons[phase.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
          const isActive = i === currentPhaseIndex;
          const isPast = i < currentPhaseIndex;
          return (
            <React.Fragment key={phase.key}>
              {i > 0 && (
                <div className={`w-3 h-px mx-px ${isPast ? 'bg-accent/40' : 'bg-border'}`} />
              )}
              <div
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors cursor-default ${
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : isPast
                    ? 'text-accent/50'
                    : 'text-text-muted/40'
                }`}
                title={phase.label}
              >
                <PhaseIcon className="w-3 h-3" />
                <span className="hidden xl:inline">{phase.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* View mode tabs */}
      <div className="flex items-center bg-bg-base rounded-md p-0.5 gap-0.5">
        {VIEW_MODES.map(mode => {
          const ModeIcon = Icons[mode.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
          const isActive = viewMode === mode.key;
          return (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                isActive
                  ? 'bg-panel text-text-main shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <ModeIcon className="w-3 h-3" />
              <span className="hidden md:inline">{mode.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
