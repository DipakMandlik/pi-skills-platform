import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Play, Copy, Check, BarChart3, Table2, Clock, Database, Rows, ArrowLeft, Search, ChevronDown, ChevronRight, Folder, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { mcpClient } from '../api/mcpClient';
import type {
  ExplorerDatabase,
  ListDatabasesPayload,
  ListSchemasPayload,
  ListTablesPayload,
  QueryResultPayload,
} from '../types';

const formatTableSelection = (database: string, schema: string, table: string) => `${database}.${schema}.${table}`;
const EXPLORER_CACHE_KEY_PREFIX = 'mcp-explorer-cache-v1';
const EXPLORER_FOCUS_DATABASE = (import.meta as any).env?.VITE_EXPLORER_DATABASE?.trim?.() || '';
const LOADING_LINES = [
  'Teaching micro-partitions to dance...',
  'Negotiating with Snowflake politely...',
  'Aligning result rows into formation...',
  'Warming up query profile confetti...',
];

const SEEDED_EXPLORER_CATALOG: ExplorerDatabase[] = [
  {
    name: 'CURATED_DB',
    schemas: [
      { name: 'INFORMATION_SCHEMA', tables: ['SCHEMATA', 'TABLES', 'COLUMNS'] },
      { name: 'PUBLIC', tables: ['DIM_USERS', 'DIM_SKILLS', 'FACT_USAGE_DAILY', 'FACT_QUERY_EVENTS'] },
    ],
  },
  {
    name: 'GOVERNANCE_DB',
    schemas: [
      { name: 'AI', tables: ['MODEL_ACCESS_CONTROL', 'FEATURE_FLAGS', 'SUBSCRIPTIONS'] },
      { name: 'AUDIT', tables: ['AUDIT_LOGS', 'REQUEST_TRACES', 'POLICY_EVALUATIONS'] },
      { name: 'INFORMATION_SCHEMA', tables: ['SCHEMATA', 'TABLES', 'COLUMNS'] },
      { name: 'PUBLIC', tables: ['TOKEN_USAGE_SUMMARY', 'ACCESS_REQUESTS', 'POLICIES'] },
      { name: 'SECURITY', tables: ['RBAC_USERS', 'RBAC_ROLES', 'RBAC_ASSIGNMENTS'] },
    ],
  },
  {
    name: 'PUBLISHED_DB',
    schemas: [
      { name: 'INFORMATION_SCHEMA', tables: ['SCHEMATA', 'TABLES', 'COLUMNS'] },
      { name: 'PUBLIC', tables: ['BI_DASHBOARD_METRICS', 'KPI_MONTHLY', 'MODEL_PERFORMANCE'] },
    ],
  },
  {
    name: 'RAW_DB',
    schemas: [
      { name: 'INFORMATION_SCHEMA', tables: ['SCHEMATA', 'TABLES', 'COLUMNS'] },
      { name: 'PUBLIC', tables: ['RAW_EVENTS', 'RAW_MODEL_LOGS', 'RAW_COST_EVENTS', 'RAW_USER_ACTIVITY'] },
    ],
  },
];

function getSeededCatalog(): ExplorerDatabase[] {
  if (!EXPLORER_FOCUS_DATABASE) return SEEDED_EXPLORER_CATALOG;
  const focused = SEEDED_EXPLORER_CATALOG.filter(
    (db) => db.name.toUpperCase() === EXPLORER_FOCUS_DATABASE.toUpperCase(),
  );
  return focused.length > 0 ? focused : SEEDED_EXPLORER_CATALOG;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

export function RightPanel() {
  const {
    generatedSQL,
    setGeneratedSQL,
    queryResults,
    setQueryResults,
    executionMetadata,
    setExecutionMetadata,
    isExecuting,
    setIsExecuting,
    selectedTables,
    toggleTable,
    setMcpError,
    mcpError,
    activeSkills,
    toggleSkill,
    setComposerDraft,
  } = useStore();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [explorerData, setExplorerData] = useState<ExplorerDatabase[]>([]);
  const [isExplorerLoading, setIsExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerReloadToken, setExplorerReloadToken] = useState(0);
  const [hydratedDatabases, setHydratedDatabases] = useState<string[]>([]);
  const [sqlDraft, setSqlDraft] = useState(generatedSQL || '');
  const [editorHeight, setEditorHeight] = useState(300);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [maxRows, setMaxRows] = useState(1000);
  const [loadingLineIndex, setLoadingLineIndex] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const explorerCacheKey = `${EXPLORER_CACHE_KEY_PREFIX}:${localStorage.getItem('sf_account') || 'unknown'}:${localStorage.getItem('sf_username') || 'unknown'}:${localStorage.getItem('sf_role') || 'unknown'}`;

  const SCHEMA_CONCURRENCY = 4;
  const TABLE_CONCURRENCY = 6;

  useEffect(() => {
    setSqlDraft(generatedSQL || '');
  }, [generatedSQL]);

  useEffect(() => {
    if (!isExecuting) {
      setLoadingLineIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingLineIndex((prev) => (prev + 1) % LOADING_LINES.length);
    }, 1300);

    return () => window.clearInterval(timer);
  }, [isExecuting]);

  useEffect(() => {
    const seededCatalog = getSeededCatalog();
    const seededNames = seededCatalog.map((db) => db.name);
    setExplorerData(seededCatalog);
    setHydratedDatabases(seededNames);

    let hasPrefilledCatalog = true;
    try {
      const cachedRaw = window.localStorage.getItem(explorerCacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as ExplorerDatabase[];
        if (Array.isArray(cached) && cached.length > 0) {
          setExplorerData(cached);
          setHydratedDatabases(cached.map((db) => db.name));
          hasPrefilledCatalog = true;
        }
      }
    } catch {
      // Ignore cache parsing issues and load from MCP.
    }

    let isMounted = true;

    const loadExplorerData = async () => {
      setIsExplorerLoading(!hasPrefilledCatalog);
      setExplorerError(null);

      try {
        const dbResponse = await mcpClient.callTool<ListDatabasesPayload>({
          name: 'list_databases',
          arguments: {},
        }, { timeoutMs: 120000 });

        const databases = dbResponse.result.databases || [];
        const focusedDatabases = EXPLORER_FOCUS_DATABASE
          ? databases.filter((name) => name.toUpperCase() === EXPLORER_FOCUS_DATABASE.toUpperCase())
          : databases;
        const databasesToHydrate = focusedDatabases.length > 0 ? focusedDatabases : databases;

        if (isMounted) {
          setExplorerData(databasesToHydrate.map((name) => ({ name, schemas: [] })));
        }

        const explorer = await mapWithConcurrency(
          databasesToHydrate,
          SCHEMA_CONCURRENCY,
          async (databaseName) => {
            let schemaNames: string[] = [];
            try {
              const schemaResponse = await mcpClient.callTool<ListSchemasPayload>({
                name: 'list_schemas',
                arguments: { database: databaseName },
              }, { timeoutMs: 60000 });
              schemaNames = schemaResponse.result.schemas || [];
            } catch {
              return {
                name: databaseName,
                schemas: [],
              };
            }

            const schemas = await mapWithConcurrency(
              schemaNames,
              TABLE_CONCURRENCY,
              async (schemaName) => {
                try {
                  const tableResponse = await mcpClient.callTool<ListTablesPayload>({
                    name: 'list_tables',
                    arguments: { database: databaseName, schema: schemaName },
                  }, { timeoutMs: 45000 });

                  return {
                    name: schemaName,
                    tables: tableResponse.result.tables || [],
                  };
                } catch {
                  return {
                    name: schemaName,
                    tables: [],
                  };
                }
              }
            );

            const hydratedDatabase = {
              name: databaseName,
              schemas,
            };

            if (isMounted) {
              setExplorerData((prev) => prev.map((db) => (db.name === databaseName ? hydratedDatabase : db)));
              setHydratedDatabases((prev) => (prev.includes(databaseName) ? prev : [...prev, databaseName]));
            }

            return hydratedDatabase;
          }
        );

        if (isMounted) {
          setExplorerData(explorer);
          setHydratedDatabases(explorer.map((db) => db.name));
          try {
            window.localStorage.setItem(explorerCacheKey, JSON.stringify(explorer));
          } catch {
            // Ignore cache write failures.
          }
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setExplorerData([]);
        setExplorerError(error instanceof Error ? error.message : 'Failed to load explorer data via MCP');
      } finally {
        if (isMounted) {
          setIsExplorerLoading(false);
        }
      }
    };

    loadExplorerData();
    return () => {
      isMounted = false;
    };
  }, [explorerCacheKey, explorerReloadToken]);

  const handleReloadExplorer = () => {
    setExplorerReloadToken((value) => value + 1);
  };

  const handleBackToExplorer = () => {
    setGeneratedSQL(null);
    setQueryResults(null);
    setExecutionMetadata(null);
    setMcpError(null);
  };

  const chartXAxisKey = queryResults && queryResults.length > 0 ? Object.keys(queryResults[0])[0] : 'label';
  const chartYAxisKey = queryResults && queryResults.length > 0
    ? Object.keys(queryResults[0]).find((key) => typeof queryResults[0][key] === 'number') || Object.keys(queryResults[0])[1] || chartXAxisKey
    : 'value';

  const handleCopy = () => {
    if (sqlDraft.trim()) {
      navigator.clipboard.writeText(sqlDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRunQuery = async () => {
    if (!sqlDraft.trim()) return;

    setIsExecuting(true);
    setMcpError(null);
    const startedAt = performance.now();

    try {
      const response = await mcpClient.callTool<QueryResultPayload>({
        name: 'run_query',
        arguments: {
          query: sqlDraft,
          max_rows: maxRows,
        },
      }, { timeoutMs: 180000 });

      const result = response.result;
      const rowObjects = result.rows.map((row) => {
        const mapped: Record<string, unknown> = {};
        result.columns.forEach((column, idx) => {
          mapped[column] = row[idx] ?? null;
        });
        return mapped;
      });

      setIsExecuting(false);
      setExecutionMetadata({
        timeMs: Math.round(performance.now() - startedAt),
        rows: result.row_count,
        warehouse: 'Snowflake (MCP)',
        executedQuery: result.executed_query,
      });
      setQueryResults(rowObjects);
    } catch (error) {
      setIsExecuting(false);
      setQueryResults(null);
      setExecutionMetadata(null);
      setMcpError(error instanceof Error ? error.message : 'Failed to run query via MCP');
    }
  };

  const handleRequestRefinement = (optimizerMode: boolean) => {
    const sqlText = sqlDraft.trim();
    const errorText = mcpError || 'Query execution failed';
    if (!sqlText) {
      return;
    }

    if (optimizerMode && !activeSkills.includes('Query Optimizer')) {
      toggleSkill('Query Optimizer');
    }

    const prompt = optimizerMode
      ? [
        'Optimize and refine this failed SQL for Snowflake.',
        `Execution error: ${errorText}`,
        'SQL:',
        sqlText,
      ].join('\n')
      : [
        'Refine this SQL so it executes successfully in Snowflake.',
        `Execution error: ${errorText}`,
        'Please return corrected SQL and explain the exact fix.',
        'SQL:',
        sqlText,
      ].join('\n');

    setComposerDraft(prompt);
  };

  const [catalogSearch, setCatalogSearch] = useState('');

  if (!generatedSQL) {
    const allDone = !isExplorerLoading && !explorerError && explorerData.length > 0;
    const totalDbs = explorerData.length;

    // Filter databases/schemas/tables by search query
    const filterTree = (data: typeof explorerData) => {
      if (!catalogSearch.trim()) return data;
      const q = catalogSearch.toLowerCase();
      return data
        .map((db) => {
          if (db.name.toLowerCase().includes(q)) return db;
          const schemas = db.schemas
            .map((s) => {
              if (s.name.toLowerCase().includes(q)) return s;
              const tables = s.tables.filter((t) => t.toLowerCase().includes(q));
              return tables.length > 0 ? { ...s, tables } : null;
            })
            .filter(Boolean) as typeof db.schemas;
          return schemas.length > 0 ? { ...db, schemas } : null;
        })
        .filter(Boolean) as typeof explorerData;
    };

    const filteredData = filterTree(explorerData);

    return (
      <div className="w-full h-full bg-background flex flex-col shrink-0 z-20 overflow-hidden border-l border-border text-foreground">
        {/* Header */}
        <div className="h-12 px-4 border-b border-border bg-background sticky top-0 z-10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-muted" />
            <h2 className="text-[11px] font-bold text-muted uppercase tracking-widest">Data Catalog</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReloadExplorer}
              className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              title="Reload catalog"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">Explorer</span>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border/70 focus-within:border-primary/40 transition-colors">
            <Search className="w-3.5 h-3.5 text-muted/60 shrink-0" />
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted/50 outline-none min-w-0"
            />
            {catalogSearch && (
              <button onClick={() => setCatalogSearch('')} className="text-muted hover:text-foreground shrink-0">
                <Check className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Status row */}
        <div className="px-4 py-2 shrink-0">
          {isExplorerLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <div className="w-3 h-3 border border-primary/40 border-t-primary rounded-full animate-spin shrink-0" />
              {explorerData.length > 0
                ? `Scanning schemas… (${hydratedDatabases.length}/${explorerData.length})`
                : 'Connecting to metadata…'}
            </div>
          ) : explorerError ? (
            <div className="text-[11px] text-red-400">{explorerError}</div>
          ) : allDone ? (
            <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Scanning completed
            </div>
          ) : (
            <div className="text-[11px] text-muted">No databases found.</div>
          )}
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 select-none">
          {explorerError && (
            <button onClick={handleReloadExplorer} className="mx-2 mt-1 text-[11px] text-primary hover:underline">
              Retry Connection
            </button>
          )}

          <div className="space-y-px text-[12px]">
            {filteredData.map((db) => {
              const dbExpanded = expandedNodes[`db-${db.name}`] !== false;
              return (
                <div key={db.name}>
                  {/* DB row */}
                  <button
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors group text-left"
                    onClick={(e) => toggleNode(`db-${db.name}`, e)}
                  >
                    {dbExpanded
                      ? <ChevronDown className="w-3 h-3 text-muted/50 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted/50 shrink-0" />
                    }
                    <Database className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">{db.name}</span>
                  </button>

                  {dbExpanded && (
                    <div className="ml-3 pl-2 border-l border-border/50">
                      {isExplorerLoading && !hydratedDatabases.includes(db.name) ? (
                        <div className="px-2 py-1 text-[11px] text-muted/60 italic">Loading…</div>
                      ) : (
                        db.schemas.map((schema) => {
                          const schemaExpanded = expandedNodes[`schema-${db.name}-${schema.name}`];
                          return (
                            <div key={schema.name}>
                              {/* Schema row */}
                              <button
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors group text-left"
                                onClick={(e) => toggleNode(`schema-${db.name}-${schema.name}`, e)}
                              >
                                {schemaExpanded
                                  ? <ChevronDown className="w-3 h-3 text-muted/40 shrink-0" />
                                  : <ChevronRight className="w-3 h-3 text-muted/40 shrink-0" />
                                }
                                <Folder className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                                <span className="text-muted group-hover:text-foreground transition-colors truncate">{schema.name}</span>
                              </button>

                              {schemaExpanded && (
                                <div className="ml-3 pl-2 border-l border-border/40">
                                  {schema.tables.length === 0 ? (
                                    <div className="px-2 py-1 text-[11px] text-muted/50 italic">Empty</div>
                                  ) : (
                                    schema.tables.map((table) => {
                                      const tableKey = formatTableSelection(db.name, schema.name, table);
                                      const isSelected = selectedTables.includes(tableKey);
                                      return (
                                        <button
                                          key={table}
                                          onClick={() => toggleTable(tableKey)}
                                          className={`w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md transition-colors text-left ${
                                            isSelected
                                              ? 'bg-primary/10 text-primary border border-primary/20'
                                              : 'text-muted hover:bg-surface-hover hover:text-foreground'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <Table2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted/60'}`} />
                                            <span className={`truncate text-[11px] ${isSelected ? 'font-semibold' : ''}`}>{table}</span>
                                          </div>
                                          {isSelected && <Check className="w-3 h-3 text-primary shrink-0" />}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {!isExplorerLoading && db.schemas.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-muted/50 italic">Empty</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        {!isExplorerLoading && allDone && (
          <div className="px-4 py-2.5 border-t border-border/60 shrink-0">
            <p className="text-[11px] text-muted/60">{totalDbs} database{totalDbs !== 1 ? 's' : ''} connected to Snowflake</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-surface-elevated flex flex-col shrink-0 relative z-20 overflow-hidden border-l border-border text-foreground">
      <div className="flex flex-col border-b border-border bg-surface shrink-0">
        <div className="h-16 flex items-center justify-between px-4 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToExplorer}
              className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground transition-colors"
              title="Back to Data Catalog"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Code2Icon className="w-4 h-4 text-primary" />
              SQL Editor
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={String(maxRows)}
              onChange={(e) => setMaxRows(Number(e.target.value))}
              className="px-2 py-1 bg-surface-elevated border border-slate-700 rounded-md text-xs font-medium text-foreground"
              title="Result row limit"
            >
              <option value="100">Rows: 100</option>
              <option value="500">Rows: 500</option>
              <option value="1000">Rows: 1000</option>
              <option value="5000">Rows: 5000</option>
            </select>
            <button 
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground transition-colors"
              title="Copy SQL"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button 
              onClick={handleRunQuery}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white hover:bg-cyan-500 rounded-md text-xs font-medium transition-colors disabled:opacity-50 shadow-md border border-primary/20"
            >
              {isExecuting ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {isExecuting ? 'Running...' : 'Run Query'}
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-border bg-surface/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Editor</span>
            <button
              onClick={() => setEditorHeight((h) => Math.max(180, h - 60))}
              className="px-2 py-0.5 border border-slate-700 rounded hover:bg-surface-hover transition-colors"
              title="Decrease editor height"
            >
              - Height
            </button>
            <button
              onClick={() => setEditorHeight((h) => Math.min(700, h + 60))}
              className="px-2 py-0.5 border border-slate-700 rounded hover:bg-surface-hover transition-colors"
              title="Increase editor height"
            >
              + Height
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <button
              onClick={() => setEditorFontSize((s) => Math.max(11, s - 1))}
              className="px-2 py-0.5 border border-slate-700 rounded hover:bg-surface-hover transition-colors"
              title="Decrease font size"
            >
              A-
            </button>
            <button
              onClick={() => setEditorFontSize((s) => Math.min(18, s + 1))}
              className="px-2 py-0.5 border border-slate-700 rounded hover:bg-surface-hover transition-colors"
              title="Increase font size"
            >
              A+
            </button>
            <span>{editorFontSize}px</span>
          </div>
        </div>
        <div className="p-4 bg-[#0a0a0a]" style={{ height: `${editorHeight}px` }}>
          <textarea
            value={sqlDraft}
            onChange={(e) => {
              setSqlDraft(e.target.value);
              setGeneratedSQL(e.target.value);
            }}
            spellCheck={false}
            className="w-full h-full border border-border rounded-lg bg-surface p-3 font-mono text-foreground resize-none outline-none focus:ring-2 focus:ring-cyan-500/20 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
            style={{ fontSize: `${editorFontSize}px`, lineHeight: 1.45 }}
            placeholder="Generated SQL will appear here. You can edit before running."
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-surface-elevated">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-medium text-foreground">Results</h3>
          
          {queryResults && (
            <div className="flex bg-surface rounded-lg p-0.5 border border-border">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-surface-hover text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('chart')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'chart' ? 'bg-surface-hover text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {mcpError && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div>MCP Error: {mcpError}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleRequestRefinement(false)}
                className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-surface-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
              >
                Request Refinement
              </button>
              <button
                type="button"
                onClick={() => handleRequestRefinement(true)}
                className="rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-surface-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning-light)]"
              >
                Refine with Optimizer
              </button>
            </div>
            <div className="mt-1 text-[10px] text-red-600/90">This action fills the chat composer with a ready-to-send refinement prompt.</div>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {isExecuting ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-accent bg-[radial-gradient(circle_at_top,_#eff6ff,_transparent_55%)]"
              >
                <motion.div
                  className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full mb-4"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />

                <div className="flex items-center gap-1.5 mb-3">
                  {[0, 1, 2].map((idx) => (
                    <motion.span
                      key={`dot-${idx}`}
                      className="w-2 h-2 rounded-full bg-accent/80"
                      animate={{ y: [0, -6, 0], opacity: [0.45, 1, 0.45] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: idx * 0.12 }}
                    />
                  ))}
                </div>

                <p className="text-sm font-semibold mb-1">Executing query...</p>
                <motion.p
                  key={`loading-line-${loadingLineIndex}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-text-muted"
                >
                  {LOADING_LINES[loadingLineIndex]}
                </motion.p>
              </motion.div>
            ) : queryResults ? (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col"
              >
                {executionMetadata && (
                  <div className="flex items-center gap-4 px-4 py-2 bg-surface/50 border-b border-border text-xs text-muted shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {executionMetadata.timeMs}ms
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Rows className="w-3.5 h-3.5" />
                      {executionMetadata.rows} rows
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Database className="w-3.5 h-3.5" />
                      {executionMetadata.warehouse}
                    </div>
                  </div>
                )}

                {executionMetadata?.executedQuery && (
                  <div className="px-4 py-2 border-b border-border bg-[#0a0a0a]">
                    <div className="text-[10px] uppercase tracking-wide text-muted mb-1 font-bold">Executed SQL</div>
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words inline-block">{executionMetadata.executedQuery}</pre>
                  </div>
                )}

                <div className="flex-1 overflow-auto p-4">
                  {viewMode === 'table' ? (
                    queryResults.length > 0 ? (
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-muted uppercase tracking-wider sticky top-0 bg-surface-elevated z-10 border-b border-border">
                        <tr>
                          {Object.keys(queryResults[0]).map(key => (
                            <th key={key} className="pb-3 font-medium">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {queryResults.map((row, i) => (
                          <tr key={i} className="hover:bg-surface/50 transition-colors">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="py-3 text-foreground font-mono text-xs">
                                {typeof val === 'number' ? val.toLocaleString() : (val == null ? 'NULL' : String(val))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted text-sm">
                        Query returned 0 rows
                      </div>
                    )
                  ) : (
                    <div className="h-full min-h-[300px] w-full pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={queryResults} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis 
                            dataKey={chartXAxisKey}
                            stroke="#64748b" 
                            fontSize={10} 
                            tickMargin={10}
                            angle={-45}
                            textAnchor="end"
                          />
                          <YAxis 
                            stroke="#64748b" 
                            fontSize={10}
                            tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString() : String(val)}
                          />
                          <Tooltip 
                            cursor={{ fill: '#f1f5f9' }}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#0f172a' }}
                            itemStyle={{ color: '#2563eb' }}
                          />
                          <Bar dataKey={chartYAxisKey} fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted text-sm">
                Run the query to view results
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Code2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}
