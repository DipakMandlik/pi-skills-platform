import { create } from 'zustand';
import { Message, ExecutionMetadata, Skill, ChatModel, Project, ViewMode, ProjectPhase, Stakeholder, KPIDefinition, SourceSystem, UserStory } from './types';

const DEFAULT_SKILLS: Skill[] = [
  { id: 'data-architect', name: 'Data Architect', description: 'Design scalable data models and warehouse architecture.', iconName: 'Network' },
  { id: 'analytics-engineer', name: 'Analytics Engineer', description: 'Transform data and manage dbt models.', iconName: 'Workflow' },
  { id: 'ml-engineer', name: 'ML Engineer', description: 'Build and deploy predictive models.', iconName: 'Brain' },
  { id: 'sql-writer', name: 'SQL Writer', description: 'Generate optimized SQL queries.', iconName: 'Code2' },
  { id: 'stored-procedure-writer', name: 'Stored Procedure Writer', description: 'Create, debug, and enhance Snowflake stored procedures.', iconName: 'FileCode2' },
  { id: 'query-optimizer', name: 'Query Optimizer', description: 'Improve performance & rewrite SQL.', iconName: 'Zap' },
  { id: 'data-explorer', name: 'Data Explorer', description: 'Discover schemas, tables, and columns.', iconName: 'Search' },
  { id: 'warehouse-monitor', name: 'Warehouse Monitor', description: 'Analyze usage and query costs.', iconName: 'Activity' },
  { id: 'metadata-inspector', name: 'Metadata Inspector', description: 'Explore metadata and structure.', iconName: 'Database' },
];

interface AppState {
  skills: Skill[];
  addSkill: (skill: Skill) => void;
  updateSkill: (id: string, skill: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
  activeSkills: string[];
  setActiveSkills: (skills: string[]) => void;
  toggleSkill: (skill: string) => void;
  selectedTables: string[];
  toggleTable: (table: string) => void;
  selectedSchema: string;
  setSelectedSchema: (schema: string) => void;
  chatHistory: Message[];
  addMessage: (message: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  generatedSQL: string | null;
  setGeneratedSQL: (sql: string | null) => void;
  queryResults: any[] | null;
  setQueryResults: (results: any[] | null) => void;
  executionMetadata: ExecutionMetadata | null;
  setExecutionMetadata: (metadata: ExecutionMetadata | null) => void;
  isExecuting: boolean;
  setIsExecuting: (isExecuting: boolean) => void;
  isMonitorOpen: boolean;
  setIsMonitorOpen: (isOpen: boolean) => void;
  mcpServerStatus: 'unknown' | 'ok' | 'degraded' | 'error';
  setMcpServerStatus: (status: 'unknown' | 'ok' | 'degraded' | 'error') => void;
  mcpError: string | null;
  setMcpError: (message: string | null) => void;
  selectedModel: ChatModel;
  setSelectedModel: (model: ChatModel) => void;
  thinkingEnabled: boolean;
  setThinkingEnabled: (enabled: boolean) => void;
  composerDraft: string | null;
  setComposerDraft: (draft: string | null) => void;
  // ── PROJECT STATE ──
  projects: Project[];
  activeProjectId: string | null;
  viewMode: ViewMode;
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  updateProjectPhase: (id: string, phase: ProjectPhase) => void;
  addStakeholder: (projectId: string, stakeholder: Omit<Stakeholder, 'id'>) => void;
  removeStakeholder: (projectId: string, stakeholderId: string) => void;
  addKPI: (projectId: string, kpi: Omit<KPIDefinition, 'id'>) => void;
  removeKPI: (projectId: string, kpiId: string) => void;
  addSourceSystem: (projectId: string, source: Omit<SourceSystem, 'id'>) => void;
  updateSourceSystem: (projectId: string, sourceId: string, patch: Partial<SourceSystem>) => void;
  removeSourceSystem: (projectId: string, sourceId: string) => void;
  addUserStory: (projectId: string, story: Omit<UserStory, 'id'>) => void;
  updateUserStory: (projectId: string, storyId: string, patch: Partial<UserStory>) => void;
  removeUserStory: (projectId: string, storyId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  skills: DEFAULT_SKILLS,
  addSkill: (skill) => set((state) => ({ skills: [...state.skills, skill] })),
  updateSkill: (id, updatedSkill) => set((state) => ({
    skills: state.skills.map(s => s.id === id ? { ...s, ...updatedSkill } : s)
  })),
  deleteSkill: (id) => set((state) => ({
    skills: state.skills.filter(s => s.id !== id),
    activeSkills: state.activeSkills.filter(s => s !== id)
  })),
  activeSkills: [],
  setActiveSkills: (skills) => set({ activeSkills: skills }),
  toggleSkill: (skill) => set((state) => {
    if (state.activeSkills.includes(skill)) {
      return { activeSkills: state.activeSkills.filter(s => s !== skill) };
    }
    if (state.activeSkills.length >= 3) {
      return { activeSkills: [...state.activeSkills.slice(1), skill] };
    }
    return { activeSkills: [...state.activeSkills, skill] };
  }),
  selectedTables: [],
  toggleTable: (table) => set((state) => {
    if (state.selectedTables.includes(table)) {
      return { selectedTables: state.selectedTables.filter(t => t !== table) };
    }
    return { selectedTables: [...state.selectedTables, table] };
  }),
  selectedSchema: 'AUTO',
  setSelectedSchema: (schema) => set({ selectedSchema: schema }),
  chatHistory: [
    {
      id: '1',
      role: 'assistant',
      content: 'Welcome to π-Optimized. Select a skill from the left panel or ask me anything about your data.',
    }
  ],
  addMessage: (message) => set((state) => ({ chatHistory: [...state.chatHistory, message] })),
  updateMessage: (id, patch) => set((state) => ({
    chatHistory: state.chatHistory.map((message) => (
      message.id === id ? { ...message, ...patch } : message
    )),
  })),
  generatedSQL: null,
  setGeneratedSQL: (sql) => set({ generatedSQL: sql }),
  queryResults: null,
  setQueryResults: (results) => set({ queryResults: results }),
  executionMetadata: null,
  setExecutionMetadata: (metadata) => set({ executionMetadata: metadata }),
  isExecuting: false,
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  isMonitorOpen: false,
  setIsMonitorOpen: (isOpen) => set({ isMonitorOpen: isOpen }),
  mcpServerStatus: 'unknown',
  setMcpServerStatus: (status) => set({ mcpServerStatus: status }),
  mcpError: null,
  setMcpError: (message) => set({ mcpError: message }),
  selectedModel: 'gemini-2.0-flash',
  setSelectedModel: (model) => set({ selectedModel: model }),
  thinkingEnabled: true,
  setThinkingEnabled: (enabled) => set({ thinkingEnabled: enabled }),
  composerDraft: null,
  setComposerDraft: (draft) => set({ composerDraft: draft }),
  // ── PROJECT STATE ──
  projects: JSON.parse(localStorage.getItem('pi-projects') || '[]'),
  activeProjectId: localStorage.getItem('pi-active-project') || null,
  viewMode: 'sql-workspace' as ViewMode,
  createProject: (projectData) => {
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const project: Project = { ...projectData, id, createdAt: now, updatedAt: now };
    set((state) => {
      const projects = [...state.projects, project];
      localStorage.setItem('pi-projects', JSON.stringify(projects));
      localStorage.setItem('pi-active-project', id);
      return { projects, activeProjectId: id, viewMode: 'project-canvas' as ViewMode };
    });
    return id;
  },
  updateProject: (id, patch) => set((state) => {
    const projects = state.projects.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  deleteProject: (id) => set((state) => {
    const projects = state.projects.filter(p => p.id !== id);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    const activeProjectId = state.activeProjectId === id ? null : state.activeProjectId;
    const viewMode = state.activeProjectId === id ? 'sql-workspace' as ViewMode : state.viewMode;
    if (state.activeProjectId === id) localStorage.removeItem('pi-active-project');
    return { projects, activeProjectId, viewMode };
  }),
  setActiveProject: (id) => set(() => {
    if (id) {
      localStorage.setItem('pi-active-project', id);
      return { activeProjectId: id, viewMode: 'project-canvas' as ViewMode };
    }
    localStorage.removeItem('pi-active-project');
    return { activeProjectId: null, viewMode: 'sql-workspace' as ViewMode };
  }),
  setViewMode: (mode) => set({ viewMode: mode }),
  updateProjectPhase: (id, phase) => set((state) => {
    const projects = state.projects.map(p => p.id === id ? { ...p, currentPhase: phase, updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  addStakeholder: (projectId, stakeholder) => set((state) => {
    const id = `sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const projects = state.projects.map(p => p.id === projectId ? { ...p, stakeholders: [...p.stakeholders, { ...stakeholder, id }], updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  removeStakeholder: (projectId, stakeholderId) => set((state) => {
    const projects = state.projects.map(p => p.id === projectId ? { ...p, stakeholders: p.stakeholders.filter(s => s.id !== stakeholderId), updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  addKPI: (projectId, kpi) => set((state) => {
    const id = `kpi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const projects = state.projects.map(p => p.id === projectId ? { ...p, kpis: [...p.kpis, { ...kpi, id }], updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  removeKPI: (projectId, kpiId) => set((state) => {
    const projects = state.projects.map(p => p.id === projectId ? { ...p, kpis: p.kpis.filter(k => k.id !== kpiId), updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  addSourceSystem: (projectId, source) => set((state) => {
    const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const projects = state.projects.map(p => p.id === projectId ? { ...p, sourceSystems: [...p.sourceSystems, { ...source, id }], updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  updateSourceSystem: (projectId, sourceId, patch) => set((state) => {
    const projects = state.projects.map(p => p.id === projectId ? { ...p, sourceSystems: p.sourceSystems.map(s => s.id === sourceId ? { ...s, ...patch } : s), updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  removeSourceSystem: (projectId, sourceId) => set((state) => {
    const projects = state.projects.map(p => p.id === projectId ? { ...p, sourceSystems: p.sourceSystems.filter(s => s.id !== sourceId), updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  addUserStory: (projectId, story) => set((state) => {
    const id = `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const projects = state.projects.map(p => p.id === projectId ? { ...p, userStories: [...p.userStories, { ...story, id }], updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  updateUserStory: (projectId, storyId, patch) => set((state) => {
    const projects = state.projects.map(p => p.id === projectId ? { ...p, userStories: p.userStories.map(s => s.id === storyId ? { ...s, ...patch } : s), updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
  removeUserStory: (projectId, storyId) => set((state) => {
    const projects = state.projects.map(p => p.id === projectId ? { ...p, userStories: p.userStories.filter(s => s.id !== storyId), updatedAt: new Date().toISOString() } : p);
    localStorage.setItem('pi-projects', JSON.stringify(projects));
    return { projects };
  }),
}));
