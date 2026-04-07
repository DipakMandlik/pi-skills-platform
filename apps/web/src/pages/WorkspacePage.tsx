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
    <div className="flex h-full w-full overflow-hidden bg-white">
      <LeftPanel />
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex min-w-0">
          <CenterPanel
            projectButton={
              <button
                onClick={() => setProjectOpen(!projectOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  borderRadius: '8px',
                  background: projectOpen ? '#3b82f6' : 'transparent',
                  color: projectOpen ? 'white' : '#6b7280',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Icons.FolderKanban style={{ width: '14px', height: '14px' }} />
                {activeProject ? activeProject.name : 'Project'}
              </button>
            }
          />
          {!projectOpen && <RightPanel />}
        </div>
        <ProjectPanel isOpen={projectOpen} onClose={() => setProjectOpen(false)} />
      </div>
    </div>
  );
}
