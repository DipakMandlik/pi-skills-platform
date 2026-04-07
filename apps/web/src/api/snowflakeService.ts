import { mcpClient } from './mcpClient';

interface SnowflakeRequestOptions {
  timeoutMs?: number;
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
  options?: SnowflakeRequestOptions,
): Promise<T> {
  const normalizedArgs = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined && value !== null),
  );
  try {
    const response = await mcpClient.callTool<T>({ name: toolName, arguments: normalizedArgs }, options);
    if (response.ok) return response.result as T;
    throw new Error(`Tool call failed: ${toolName}`);
  } catch (err) {
    console.error(`[snowflakeService] ${toolName} failed:`, err);
    throw err;
  }
}

// ── Database / Schema / Table Discovery ──

export async function listDatabases(options?: SnowflakeRequestOptions): Promise<string[]> {
  const result = await callSnowflakeTool<{ databases: string[] }>('list_databases', {}, options);
  return result.databases || [];
}

export async function listSchemas(database?: string, options?: SnowflakeRequestOptions): Promise<string[]> {
  const result = await callSnowflakeTool<{ schemas: string[] }>('list_schemas', { database }, options);
  return result.schemas || [];
}

export async function listTables(database?: string, schema?: string, options?: SnowflakeRequestOptions): Promise<string[]> {
  const result = await callSnowflakeTool<{ tables: string[] }>('list_tables', { database, schema }, options);
  return result.tables || [];
}

export async function describeTable(table: string, database?: string, schema?: string, options?: SnowflakeRequestOptions): Promise<SnowflakeQueryResult> {
  return callSnowflakeTool<SnowflakeQueryResult>('describe_table', { table, database, schema }, options);
}

// ── Warehouse ──

export async function listWarehouses(options?: SnowflakeRequestOptions): Promise<SnowflakeWarehouse[]> {
  const result = await callSnowflakeTool<SnowflakeQueryResult>('list_warehouses', {}, options);
  if (!result.rows) return [];
  return result.rows.map((row) => ({
    name: String(row[0] || ''),
    state: String(row[1] || ''),
    size: String(row[2] || ''),
    running: Number(row[3] || 0),
    queued: Number(row[4] || 0),
  }));
}

export async function warehouseUsage(options?: SnowflakeRequestOptions): Promise<SnowflakeQueryResult> {
  return callSnowflakeTool<SnowflakeQueryResult>('warehouse_usage', {}, options);
}

// ── Query ──

export async function runQuery(query: string, options?: SnowflakeRequestOptions): Promise<SnowflakeQueryResult> {
  return callSnowflakeTool<SnowflakeQueryResult>('run_query', { query }, options);
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

export async function fetchDashboardData(options?: SnowflakeRequestOptions): Promise<DashboardData> {
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
    // Fetch databases and warehouses first; list_tables requires both database and schema.
    const [databases, warehouses] = await Promise.allSettled([
      listDatabases(options),
      listWarehouses(options),
    ]);

    if (databases.status === 'fulfilled') {
      data.databases = databases.value;
      data.totalDatabases = databases.value.length;
    }

    if (databases.status === 'fulfilled' && databases.value.length > 0) {
      const defaultDatabase = databases.value[0];
      const schemas = await listSchemas(defaultDatabase, options).catch(() => []);
      data.schemas = schemas;
      data.totalSchemas = schemas.length;

      if (schemas.length > 0) {
        const tables = await listTables(defaultDatabase, schemas[0], options).catch(() => []);
        data.tables = tables;
        data.totalTables = tables.length;
      }
    }

    if (warehouses.status === 'fulfilled') {
      data.warehouses = warehouses.value;
      data.totalWarehouses = warehouses.value.length;
      data.runningWarehouses = warehouses.value.filter((w) => w.state === 'RUNNING').length;
    }

    data.connected = databases.status === 'fulfilled' || warehouses.status === 'fulfilled';
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

export async function fetchQueryHistory(limit = 20, options?: SnowflakeRequestOptions): Promise<QueryHistoryEntry[]> {
  try {
    const result = await callSnowflakeTool<SnowflakeQueryResult>('get_query_history', { limit: String(limit) }, options);
    if (!result.rows) return [];
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
