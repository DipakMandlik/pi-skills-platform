import { demoDelay } from './demoMode';
import type { MCPToolDefinition, QueryResultPayload } from '../types';

function parseBody(options: RequestInit): any {
  if (!options.body) return null;
  if (typeof options.body === 'string') {
    try { return JSON.parse(options.body); } catch { return null; }
  }
  return null;
}

function toolDef(name: string, description: string, inputSchema: Record<string, unknown>): MCPToolDefinition {
  return {
    name,
    description,
    inputSchema,
    outputSchema: { type: 'object' },
  };
}

function makeTools(): MCPToolDefinition[] {
  return [
    toolDef('list_databases', 'List accessible databases.', { type: 'object', properties: {} }),
    toolDef('list_schemas', 'List schemas in a database.', { type: 'object', properties: { database: { type: 'string' } } }),
    toolDef('list_tables', 'List tables in a database/schema.', { type: 'object', properties: { database: { type: 'string' }, schema: { type: 'string' } } }),
    toolDef('describe_table', 'Describe a table.', { type: 'object', properties: { table: { type: 'string' }, database: { type: 'string' }, schema: { type: 'string' } }, required: ['table'] }),
    toolDef('list_warehouses', 'List warehouses.', { type: 'object', properties: {} }),
    toolDef('warehouse_usage', 'Return warehouse usage statistics.', { type: 'object', properties: {} }),
    toolDef('run_query', 'Execute a query (demo mode).', { type: 'object', properties: { query: { type: 'string' }, max_rows: { type: 'number' } }, required: ['query'] }),
    toolDef('get_query_history', 'Return recent query history.', { type: 'object', properties: { limit: { type: 'string' } } }),
  ];
}

const DEMO_DBS = ['DEMO_ANALYTICS', 'DEMO_FINANCE', 'DEMO_SECURITY'];
const DEMO_SCHEMAS = ['PUBLIC', 'RAW', 'MART'];
const DEMO_TABLES = ['FACT_EVENTS', 'DIM_USERS', 'DIM_SKILLS', 'FACT_USAGE', 'FACT_COST'];

function queryId(prefix = 'q'): string {
  return `${prefix}_${Math.floor(Date.now() / 1000)}`;
}

function makeQueryResult(rows = 25): QueryResultPayload {
  const columns = ['DATE', 'TOKENS', 'COST_USD', 'LATENCY_MS', 'OUTCOME'];
  const outRows: Array<Array<string | number | boolean | null>> = [];
  for (let i = 0; i < rows; i += 1) {
    outRows.push([
      new Date(Date.now() - i * 3600_000).toISOString().slice(0, 10),
      300 + (i * 47) % 1800,
      Number((0.02 + ((i * 13) % 100) / 1000).toFixed(3)),
      140 + (i * 19) % 900,
      i % 9 === 0 ? 'denied' : 'allowed',
    ]);
  }
  return {
    query_id: queryId('demo'),
    executed_query: '/* demo mode */ SELECT ...',
    columns,
    rows: outRows,
    row_count: outRows.length,
  };
}

export async function mockMcpRequest<T>(path: string, init: RequestInit): Promise<T> {
  await demoDelay();
  const method = String(init.method || 'GET').toUpperCase();

  if (method === 'GET' && path === '/health') {
    return {
      status: 'ok',
      missing_env: [],
      sql_safety_mode: 'dev',
      snowflake_connector_ready: true,
      snowflake_connector_message: null,
    } as T;
  }

  if (method === 'GET' && path === '/mcp/tools') {
    return { tools: makeTools() } as T;
  }

  if (method === 'POST' && path === '/mcp/call') {
    const payload = parseBody(init) || {};
    const name = String(payload?.name || '');
    const args = (payload?.arguments || {}) as Record<string, unknown>;

    const ok = <R>(result: R) => ({ ok: true, name, result });

    if (name === 'list_databases') {
      return ok({ databases: DEMO_DBS, query_id: queryId('db') }) as T;
    }
    if (name === 'list_schemas') {
      const db = String(args.database || DEMO_DBS[0]);
      return ok({ schemas: DEMO_SCHEMAS.map((s) => `${s}`), query_id: queryId(`sch_${db}`) }) as T;
    }
    if (name === 'list_tables') {
      return ok({ tables: DEMO_TABLES, query_id: queryId('tbl') }) as T;
    }
    if (name === 'describe_table') {
      return ok({
        query_id: queryId('desc'),
        columns: ['name', 'type', 'nullable'],
        rows: [
          ['ID', 'NUMBER', 'NO'],
          ['CREATED_AT', 'TIMESTAMP_NTZ', 'NO'],
          ['USER_ID', 'VARCHAR', 'YES'],
          ['SKILL_ID', 'VARCHAR', 'YES'],
          ['TOKENS', 'NUMBER', 'YES'],
        ],
        row_count: 5,
      }) as T;
    }
    if (name === 'list_warehouses') {
      return ok({
        query_id: queryId('wh'),
        columns: ['NAME', 'STATE', 'SIZE', 'RUNNING', 'QUEUED'],
        rows: [
          ['DEMO_WH_XS', 'RUNNING', 'X-SMALL', 3, 0],
          ['DEMO_WH_M', 'SUSPENDED', 'MEDIUM', 0, 2],
          ['DEMO_WH_L', 'RUNNING', 'LARGE', 1, 0],
        ],
        row_count: 3,
      }) as T;
    }
    if (name === 'warehouse_usage') {
      return ok(makeQueryResult(18)) as T;
    }
    if (name === 'get_query_history') {
      const limit = Math.max(1, Math.min(50, Number(args.limit || 10)));
      const rows: unknown[][] = Array.from({ length: limit }, (_, i) => ([
        `QH_${i + 1}`,
        `SELECT * FROM ${DEMO_DBS[0]}.${DEMO_SCHEMAS[0]}.${DEMO_TABLES[i % DEMO_TABLES.length]} LIMIT 100;`,
        i % 10 === 0 ? 'ERROR' : 'SUCCESS',
        new Date(Date.now() - i * 300_000).toISOString(),
        new Date(Date.now() - i * 300_000 + 1200).toISOString(),
        1200 + i * 17,
        10_000_000 + i * 100_000,
        100 + (i * 9) % 900,
        'demo_user',
        'DEMO_WH_XS',
      ]));
      return ok({
        query_id: queryId('qh'),
        columns: ['ID', 'QUERY_TEXT', 'STATUS', 'START_TIME', 'END_TIME', 'TOTAL_ELAPSED_TIME', 'BYTES_SCANNED', 'ROWS_PRODUCED', 'USER_NAME', 'WAREHOUSE_NAME'],
        rows,
        row_count: rows.length,
      }) as T;
    }
    if (name === 'run_query') {
      const maxRows = Math.max(1, Math.min(1000, Number(args.max_rows || 50)));
      return ok(makeQueryResult(Math.min(50, maxRows))) as T;
    }

    return { ok: false, name, result: { message: `Unknown tool: ${name}` } } as T;
  }

  throw new Error(`Demo mode: unhandled MCP route ${method} ${path}`);
}

