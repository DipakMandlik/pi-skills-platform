import { mcpClient } from './mcpClient';

let _toolSupport: Set<string> | null = null;

async function hasTool(name: string): Promise<boolean> {
  if (_toolSupport) return _toolSupport.has(name);
  try {
    const tools = await mcpClient.listTools({ timeoutMs: 2500 });
    _toolSupport = new Set(tools.map((t) => t.name));
    return _toolSupport.has(name);
  } catch {
    return false;
  }
}

export interface SnowflakeQueryResult {
  query_id: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
}

export interface SnowflakeDatabase {
  name: string;
  created_on: string;
}

export interface SnowflakeSchema {
  name: string;
  database: string;
}

export interface SnowflakeTable {
  name: string;
  schema: string;
  database: string;
  kind: string;
  rows: number;
  bytes: number;
}

export interface SnowflakeWarehouse {
  name: string;
  state: string;
  size: string;
  running: number;
  queued: number;
}

async function callSnowflakeTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {},
  options: { silent?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const normalizedArgs = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined && value !== null),
  );
  try {
    const response = await mcpClient.callTool<T>(
      { name: toolName, arguments: normalizedArgs },
      { timeoutMs: options.timeoutMs },
    );
    if (response.ok) return response.result as T;
    throw new Error(`Tool call failed: ${toolName}`);
  } catch (err) {
    if (!options.silent) {
      console.error(`[snowflakeService] ${toolName} failed:`, err);
    }
    throw err;
  }
}

// ── Database / Schema / Table Discovery ──

export async function listDatabases(): Promise<string[]> {
  const result = await callSnowflakeTool<{ databases: string[] }>('list_databases');
  return result.databases || [];
}

export async function listSchemas(database?: string): Promise<string[]> {
  const result = await callSnowflakeTool<{ schemas: string[] }>('list_schemas', { database });
  return result.schemas || [];
}

export async function listTables(database?: string, schema?: string): Promise<string[]> {
  const result = await callSnowflakeTool<{ tables: string[] }>('list_tables', { database, schema });
  return result.tables || [];
}

export async function describeTable(table: string, database?: string, schema?: string): Promise<SnowflakeQueryResult> {
  return callSnowflakeTool<SnowflakeQueryResult>('describe_table', { table, database, schema });
}

// ── Warehouse ──

export async function listWarehouses(): Promise<SnowflakeWarehouse[]> {
  const result = await callSnowflakeTool<SnowflakeQueryResult>('list_warehouses');
  if (!result.rows) return [];
  return result.rows.map((row) => ({
    name: String(row[0] || ''),
    state: String(row[1] || ''),
    size: String(row[2] || ''),
    running: Number(row[3] || 0),
    queued: Number(row[4] || 0),
  }));
}

export async function warehouseUsage(): Promise<SnowflakeQueryResult> {
  return callSnowflakeTool<SnowflakeQueryResult>('warehouse_usage');
}

// ── Query ──

export async function runQuery(query: string): Promise<SnowflakeQueryResult> {
  return callSnowflakeTool<SnowflakeQueryResult>('run_query', { query });
}

// ── Aggregated Dashboard Data ──

export interface DashboardData {
  databases: string[];
  schemas: string[];
  tables: string[];
  warehouses: SnowflakeWarehouse[];
  totalDatabases: number;
  totalSchemas: number;
  totalTables: number;
  totalWarehouses: number;
  runningWarehouses: number;
  connected: boolean;
  error?: string;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const data: DashboardData = {
    databases: [],
    schemas: [],
    tables: [],
    warehouses: [],
    totalDatabases: 0,
    totalSchemas: 0,
    totalTables: 0,
    totalWarehouses: 0,
    runningWarehouses: 0,
    connected: false,
  };

  try {
    const [databases, warehouses] = await Promise.all([
      callSnowflakeTool<{ databases: string[] }>('list_databases', {}, { silent: true, timeoutMs: 3000 })
        .then((r) => r.databases || [])
        .catch(() => []),
      callSnowflakeTool<SnowflakeQueryResult>('list_warehouses', {}, { silent: true, timeoutMs: 3000 })
        .then((result) => {
          if (!result.rows) return [] as SnowflakeWarehouse[];
          return result.rows.map((row) => ({
            name: String(row[0] || ''),
            state: String(row[1] || ''),
            size: String(row[2] || ''),
            running: Number(row[3] || 0),
            queued: Number(row[4] || 0),
          }));
        })
        .catch(() => [] as SnowflakeWarehouse[]),
    ]);

    data.databases = databases;
    data.totalDatabases = databases.length;

    // list_tables requires both database and schema in the MCP bridge.
    const defaultDatabase = databases[0];
    if (defaultDatabase) {
      const schemas = await callSnowflakeTool<{ schemas: string[] }>(
        'list_schemas',
        { database: defaultDatabase },
        { silent: true, timeoutMs: 3000 },
      ).then((r) => r.schemas || []).catch(() => []);
      data.schemas = schemas;
      data.totalSchemas = schemas.length;

      const defaultSchema = schemas[0];
      if (defaultSchema) {
        const tables = await callSnowflakeTool<{ tables: string[] }>(
          'list_tables',
          { database: defaultDatabase, schema: defaultSchema },
          { silent: true, timeoutMs: 3000 },
        ).then((r) => r.tables || []).catch(() => []);
        data.tables = tables;
        data.totalTables = tables.length;
      }
    }

    data.warehouses = warehouses;
    data.totalWarehouses = warehouses.length;
    data.runningWarehouses = warehouses.filter((w) => w.state === 'RUNNING').length;

    data.connected = data.totalDatabases > 0 || data.totalWarehouses > 0;
  } catch (err) {
    data.error = err instanceof Error ? err.message : 'Failed to connect to Snowflake';
  }

  return data;
}

export interface QueryHistoryEntry {
  id: string;
  query_text: string;
  status: string;
  start_time: string;
  end_time: string;
  total_elapsed_time: number;
  bytes_scanned: number;
  rows_produced: number;
  user_name: string;
  warehouse_name: string;
}

export async function fetchQueryHistory(limit = 20): Promise<QueryHistoryEntry[]> {
  try {
    if (!(await hasTool('get_query_history'))) {
      return [];
    }
    const result = await callSnowflakeTool<SnowflakeQueryResult>(
      'get_query_history',
      { limit: String(limit) },
      { silent: true, timeoutMs: 3000 },
    );
    if (!result.rows || result.rows.length === 0) return [];
    return result.rows.map((row, i) => ({
      id: String(row[0] || `q_${i}`),
      query_text: String(row[1] || ''),
      status: String(row[2] || 'UNKNOWN'),
      start_time: String(row[3] || ''),
      end_time: String(row[4] || ''),
      total_elapsed_time: Number(row[5] || 0),
      bytes_scanned: Number(row[6] || 0),
      rows_produced: Number(row[7] || 0),
      user_name: String(row[8] || ''),
      warehouse_name: String(row[9] || ''),
    }));
  } catch {
    return [];
  }
}
