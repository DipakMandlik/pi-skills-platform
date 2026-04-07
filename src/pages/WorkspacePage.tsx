import React from 'react';
import { LeftPanel } from '../components/LeftPanel';
import { CenterPanel } from '../components/CenterPanel';
import { RightPanel } from '../components/RightPanel';
import { ProjectPanel } from '../components/project/ProjectPanel';
import { useStore } from '../store';
import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';

export function WorkspacePage() {
  const { activeProjectId, projects, setIsMonitorOpen } = useStore();
  const [projectOpen, setProjectOpen] = useState(false);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  useEffect(() => {
    const handleOpenProjectPanel = () => setProjectOpen(true);
    const handleOpenMonitor = () => setIsMonitorOpen(true);

    window.addEventListener('open-project-panel', handleOpenProjectPanel);
    window.addEventListener('open-monitor', handleOpenMonitor);

    return () => {
      window.removeEventListener('open-project-panel', handleOpenProjectPanel);
      window.removeEventListener('open-monitor', handleOpenMonitor);
    };
  }, [setIsMonitorOpen]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background font-sans transition-colors duration-150">
      {/* 20% Resizable Left Column */}
      <div className="w-[20%] min-w-[240px] max-w-[400px] resize-x overflow-hidden shrink-0 border-r border-border/60 bg-surface/30 flex flex-col relative">
        <LeftPanel />
      </div>

      {/* 60% Center Column */}
      <div className="flex-1 flex min-w-0 relative">
        <CenterPanel
          projectButton={
            <button
              onClick={() => setProjectOpen(!projectOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-full transition-all duration-150 ${
                projectOpen
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'bg-surface-elevated text-foreground border border-border/60 hover:bg-surface-hover hover:border-border'
              }`}
            >
              <Icons.FolderKanban className="w-3 h-3" />
              {activeProject ? activeProject.name : 'PiOptimized'}
            </button>
          }
        />
      </div>

      {/* 25% Right Column */}
      {!projectOpen && (
        <div className="w-[25%] min-w-[300px] max-w-[450px] shrink-0 border-l border-border/60 bg-surface/20 flex flex-col z-10">
          <RightPanel />
        </div>
      )}

      {/* Project Panel (Takes right column space when open) */}
      <ProjectPanel isOpen={projectOpen} onClose={() => setProjectOpen(false)} />
    </div>
  );
}
