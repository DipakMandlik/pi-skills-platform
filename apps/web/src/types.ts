export interface Skill {
  id: string;
  name: string;
  description: string;
  iconName: string;
  isCustom?: boolean;
}

export type ChatModel =
  | 'gemini-2.0-flash'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-pro'
  | 'gpt-4o-mini'
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'o3-mini';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  thinking?: string;
}

export interface ExecutionMetadata {
  timeMs: number;
  rows: number;
  warehouse: string;
  executedQuery?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface MCPToolCallResponse<T = unknown> {
  ok: boolean;
  name: string;
  result: T;
}

export interface QueryResultPayload {
  query_id: string;
  executed_query?: string;
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
  row_count: number;
}

export interface ListDatabasesPayload {
  databases: string[];
  query_id: string;
}

export interface ListSchemasPayload {
  schemas: string[];
  query_id: string;
}

export interface ListTablesPayload {
  tables: string[];
  query_id: string;
}

export interface ExplorerSchema {
  name: string;
  tables: string[];
}

export interface ExplorerDatabase {
  name: string;
  schemas: ExplorerSchema[];
}

export interface MCPHealthResponse {
  status: 'ok' | 'degraded';
  missing_env: string[];
  sql_safety_mode: string;
  snowflake_connector_ready?: boolean;
  snowflake_connector_message?: string | null;
}

// ── PROJECT TYPES ──

export type ProjectPhase =
  | 'discovery'
  | 'architecture'
  | 'development'
  | 'testing'
  | 'documentation'
  | 'deployment'
  | 'monitoring';

export type ViewMode = 'sql-workspace' | 'project-canvas' | 'story-board';

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  formula: string;
  target: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

export interface SourceSystem {
  id: string;
  name: string;
  type: 'database' | 'api' | 'file' | 'saas' | 'other';
  description: string;
  schema?: string;
  owner: string;
  sla?: string;
  connectivity: 'available' | 'pending' | 'blocked';
  pii: boolean;
}

export interface UserStory {
  id: string;
  role: string;
  feature: string;
  benefit: string;
  acceptanceCriteria: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  linkedKPI?: string;
  linkedSourceSystem?: string;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
  isPII: boolean;
}

export interface DataContract {
  id: string;
  projectId: string;
  sourceSystemId: string;
  grain: string;
  schema: ColumnDefinition[];
  freshnessSLA: string;
  owner: string;
  piiColumns: string[];
  version: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  businessGoals: string[];
  stakeholders: Stakeholder[];
  kpis: KPIDefinition[];
  sourceSystems: SourceSystem[];
  userStories: UserStory[];
  currentPhase: ProjectPhase;
  createdAt: string;
  updatedAt: string;
}
