import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Play, Copy, Check, BarChart3, Table2, Clock, Database, Rows, ArrowLeft, Server, History, ChevronDown, ChevronRight } from 'lucide-react';
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
import type { SnowflakeWarehouse, QueryHistoryEntry } from '../api/snowflakeService';
import { listWarehouses, fetchQueryHistory } from '../api/snowflakeService';

const formatTableSelection = (database: string, schema: string, table: string) => `${database}.${schema}.${table}`;
const EXPLORER_CACHE_KEY = 'mcp-explorer-cache-v1';
const EXPLORER_FOCUS_DATABASE = (import.meta as any).env?.VITE_EXPLORER_DATABASE?.trim?.() || '';
const LOADING_LINES = [
  'Teaching micro-partitions to dance...',
  'Negotiating with Snowflake politely...',
  'Aligning result rows into formation...',
  'Warming up query profile confetti...',
];

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
  const [warehouses, setWarehouses] = useState<SnowflakeWarehouse[]>([]);
  const [isWarehousesLoading, setIsWarehousesLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    databases: true,
    warehouses: true,
    queries: true,
  });

  const SCHEMA_CONCURRENCY = 4;
  const TABLE_CONCURRENCY = 6;
  const MAX_DATABASES_TO_HYDRATE = 3;
  const MAX_SCHEMAS_TO_HYDRATE = 10;

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
    let hadCache = false;
    try {
      const cachedRaw = window.localStorage.getItem(EXPLORER_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as ExplorerDatabase[];
        if (Array.isArray(cached) && cached.length > 0) {
          setExplorerData(cached);
          setHydratedDatabases(cached.map((db) => db.name));
          hadCache = true;
        }
      }
    } catch {
      // Ignore cache parsing issues and load from MCP.
    }

    let isMounted = true;

    const loadExplorerData = async () => {
      setIsExplorerLoading(true);
      setExplorerError(null);
      if (!hadCache) {
        setHydratedDatabases([]);
      }

      try {
        const dbResponse = await mcpClient.callTool<ListDatabasesPayload>({
          name: 'list_databases',
          arguments: {},
        }, { timeoutMs: 20000 });

        const databases = dbResponse.result.databases || [];
        const focusedDatabases = EXPLORER_FOCUS_DATABASE
          ? databases.filter((name) => name.toUpperCase() === EXPLORER_FOCUS_DATABASE.toUpperCase())
          : databases;
        const databasesToHydrate = (focusedDatabases.length > 0 ? focusedDatabases : databases).slice(0, MAX_DATABASES_TO_HYDRATE);

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
              }, { timeoutMs: 15000 });
              schemaNames = (schemaResponse.result.schemas || []).slice(0, MAX_SCHEMAS_TO_HYDRATE);
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
                  }, { timeoutMs: 15000 });

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
            window.localStorage.setItem(EXPLORER_CACHE_KEY, JSON.stringify(explorer));
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
  }, [explorerReloadToken]);

  useEffect(() => {
    setIsWarehousesLoading(true);
    listWarehouses({ timeoutMs: 15000 })
      .then(setWarehouses)
      .catch(() => setWarehouses([]))
      .finally(() => setIsWarehousesLoading(false));
  }, [explorerReloadToken]);

  useEffect(() => {
    setIsHistoryLoading(true);
    fetchQueryHistory(20, { timeoutMs: 15000 })
      .then(setQueryHistory)
      .catch(() => setQueryHistory([]))
      .finally(() => setIsHistoryLoading(false));
  }, [explorerReloadToken]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  if (!generatedSQL) {
    return (
      <div className="w-[400px] xl:w-[500px] h-full bg-bg-base border-l border-border flex flex-col shrink-0 z-20 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] overflow-y-auto">
        <div className="h-16 px-6 border-b border-border bg-panel sticky top-0 z-10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            <h2 className="text-base font-display font-semibold text-text-main">
              Data Explorer
            </h2>
          </div>
          <p className="text-xs text-text-muted">Select datasets to query</p>
        </div>
        
        <div className="p-4 space-y-4">
          {isExplorerLoading && (
            <div className="rounded-xl border border-border bg-panel p-4 text-sm text-text-muted">
              {explorerData.length > 0
                ? `Loading schemas and tables... (${hydratedDatabases.length}/${explorerData.length} databases ready)`
                : 'Loading databases, schemas, and tables from MCP...'}
            </div>
          )}

          {explorerError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div>MCP Explorer Error: {explorerError}</div>
              <button
                onClick={handleReloadExplorer}
                className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Retry Load
              </button>
            </div>
          )}

          {!isExplorerLoading && !explorerError && explorerData.length === 0 && (
            <div className="rounded-xl border border-border bg-panel p-4 text-sm text-text-muted">
              No databases found for this Snowflake role.
            </div>
          )}

          {!explorerError && explorerData.map((database) => (
            <div key={database.name} className="bg-panel border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 border-b border-border flex items-center gap-2">
                <Database className="w-4 h-4 text-accent" />
                <span className="font-medium text-sm text-text-main">{database.name}</span>
              </div>
              <div>
                {isExplorerLoading && !hydratedDatabases.includes(database.name) && (
                  <div className="px-4 py-3 text-xs text-text-muted border-t border-border">Loading schemas and tables...</div>
                )}
                {database.schemas.map((schema) => (
                  <div key={`${database.name}.${schema.name}`} className="border-t border-border first:border-t-0">
                    <div className="px-4 py-2 bg-slate-50/60 text-xs font-semibold text-slate-600">
                      {schema.name}
                    </div>
                    <div className="divide-y divide-border">
                      {schema.tables.map((table) => {
                        const tableKey = formatTableSelection(database.name, schema.name, table);
                        const isSelected = selectedTables.includes(tableKey);
                        return (
                          <button
                            key={tableKey}
                            onClick={() => toggleTable(tableKey)}
                            className={`w-full px-4 py-2.5 flex items-center justify-between transition-colors group cursor-pointer ${isSelected ? 'bg-emerald-500/5' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex items-center gap-2">
                              <Table2 className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-500' : 'text-text-muted'}`} />
                              <span className={`text-sm font-mono ${isSelected ? 'text-emerald-700 font-medium' : 'text-slate-700'}`}>{table}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isSelected ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-[10px] text-text-muted bg-slate-100 px-1.5 py-0.5 rounded">Select</span>
                                  <Rows className="w-3.5 h-3.5 text-text-muted" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {schema.tables.length === 0 && (
                        <div className="px-4 py-2.5 text-xs text-text-muted">No tables in this schema.</div>
                      )}
                    </div>
                  </div>
                ))}
                {database.schemas.length === 0 && (!isExplorerLoading || hydratedDatabases.includes(database.name)) && (
                  <div className="px-4 py-3 text-xs text-text-muted border-t border-border">No schemas found in this database.</div>
                )}
              </div>
            </div>
          ))}

          {/* Warehouses Section */}
          <div className="bg-panel border border-border rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => toggleSection('warehouses')}
              className="w-full px-4 py-3 bg-slate-50 border-b border-border flex items-center justify-between hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-accent" />
                <span className="font-medium text-sm text-text-main">Warehouses</span>
                <span className="text-xs text-text-muted bg-slate-200 px-1.5 py-0.5 rounded">
                  {warehouses.length}
                </span>
              </div>
              {expandedSections.warehouses ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>
            {expandedSections.warehouses && (
              <div className="divide-y divide-border">
                {isWarehousesLoading && (
                  <div className="px-4 py-3 text-xs text-text-muted">Loading warehouses...</div>
                )}
                {!isWarehousesLoading && warehouses.length === 0 && (
                  <div className="px-4 py-3 text-xs text-text-muted">No warehouses found.</div>
                )}
                {!isWarehousesLoading && warehouses.map((wh) => (
                  <div key={wh.name} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${wh.state === 'RUNNING' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <span className="text-sm font-mono text-slate-700">{wh.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded">{wh.size}</span>
                      {wh.running > 0 && <span className="text-emerald-600">{wh.running} running</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Queries Section */}
          <div className="bg-panel border border-border rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => toggleSection('queries')}
              className="w-full px-4 py-3 bg-slate-50 border-b border-border flex items-center justify-between hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-accent" />
                <span className="font-medium text-sm text-text-main">Recent Queries</span>
                <span className="text-xs text-text-muted bg-slate-200 px-1.5 py-0.5 rounded">
                  {queryHistory.length}
                </span>
              </div>
              {expandedSections.queries ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>
            {expandedSections.queries && (
              <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                {isHistoryLoading && (
                  <div className="px-4 py-3 text-xs text-text-muted">Loading query history...</div>
                )}
                {!isHistoryLoading && queryHistory.length === 0 && (
                  <div className="px-4 py-3 text-xs text-text-muted">No query history found.</div>
                )}
                {!isHistoryLoading && queryHistory.slice(0, 20).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      setComposerDraft(q.query_text);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${q.status === 'SUCCESS' ? 'bg-emerald-500' : q.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-slate-700 line-clamp-2 group-hover:text-accent transition-colors">
                          {q.query_text}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
                          <span>{q.user_name}</span>
                          <span>•</span>
                          <span>{Math.round(q.total_elapsed_time / 1000)}s</span>
                          {q.rows_produced > 0 && <><span>•</span><span>{q.rows_produced} rows</span></>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] xl:w-[500px] h-full bg-panel border-l border-border flex flex-col shrink-0 relative z-20 shadow-[-4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col border-b border-border bg-slate-50 shrink-0">
        <div className="h-16 flex items-center justify-between px-6 border-b border-border bg-white shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToExplorer}
              className="p-1.5 rounded hover:bg-slate-100 text-text-muted hover:text-text-main transition-colors"
              title="Back to Data Explorer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-display font-semibold text-text-main flex items-center gap-2">
              <Code2Icon className="w-5 h-5 text-accent" />
              SQL Editor
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={String(maxRows)}
              onChange={(e) => setMaxRows(Number(e.target.value))}
              className="px-2 py-1 bg-white border border-border rounded-md text-xs font-medium text-text-main"
              title="Result row limit"
            >
              <option value="100">Rows: 100</option>
              <option value="500">Rows: 500</option>
              <option value="1000">Rows: 1000</option>
              <option value="5000">Rows: 5000</option>
            </select>
            <button 
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-slate-100 text-text-muted hover:text-text-main transition-colors"
              title="Copy SQL"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button 
              onClick={handleRunQuery}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white hover:bg-accent/90 rounded-md text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
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
        <div className="px-4 py-2 border-b border-border bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Editor</span>
            <button
              onClick={() => setEditorHeight((h) => Math.max(180, h - 60))}
              className="px-2 py-0.5 border border-border rounded hover:bg-slate-50"
              title="Decrease editor height"
            >
              - Height
            </button>
            <button
              onClick={() => setEditorHeight((h) => Math.min(700, h + 60))}
              className="px-2 py-0.5 border border-border rounded hover:bg-slate-50"
              title="Increase editor height"
            >
              + Height
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <button
              onClick={() => setEditorFontSize((s) => Math.max(11, s - 1))}
              className="px-2 py-0.5 border border-border rounded hover:bg-slate-50"
              title="Decrease font size"
            >
              A-
            </button>
            <button
              onClick={() => setEditorFontSize((s) => Math.min(18, s + 1))}
              className="px-2 py-0.5 border border-border rounded hover:bg-slate-50"
              title="Increase font size"
            >
              A+
            </button>
            <span>{editorFontSize}px</span>
          </div>
        </div>
        <div className="p-4 bg-slate-50" style={{ height: `${editorHeight}px` }}>
          <textarea
            value={sqlDraft}
            onChange={(e) => {
              setSqlDraft(e.target.value);
              setGeneratedSQL(e.target.value);
            }}
            spellCheck={false}
            className="w-full h-full border border-border rounded-lg bg-white p-3 font-mono text-slate-800 resize-none outline-none focus:ring-2 focus:ring-accent/20"
            style={{ fontSize: `${editorFontSize}px`, lineHeight: 1.45 }}
            placeholder="Generated SQL will appear here. You can edit before running."
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-medium text-text-main">Results</h3>
          
          {queryResults && (
            <div className="flex bg-slate-100 rounded-lg p-0.5 border border-border">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white text-accent shadow-sm' : 'text-text-muted hover:text-text-main'}`}
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('chart')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'chart' ? 'bg-white text-accent shadow-sm' : 'text-text-muted hover:text-text-main'}`}
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
                className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                Request Refinement
              </button>
              <button
                type="button"
                onClick={() => handleRequestRefinement(true)}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
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
                  <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 border-b border-border text-xs text-text-muted shrink-0">
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
                  <div className="px-4 py-2 border-b border-border bg-white">
                    <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Executed SQL</div>
                    <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">{executionMetadata.executedQuery}</pre>
                  </div>
                )}

                <div className="flex-1 overflow-auto p-4">
                  {viewMode === 'table' ? (
                    queryResults.length > 0 ? (
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-text-muted uppercase tracking-wider sticky top-0 bg-panel z-10 border-b border-border">
                        <tr>
                          {Object.keys(queryResults[0]).map(key => (
                            <th key={key} className="pb-3 font-medium">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {queryResults.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="py-3 text-text-main font-mono text-xs">
                                {typeof val === 'number' ? val.toLocaleString() : (val == null ? 'NULL' : String(val))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    ) : (
                      <div className="h-full flex items-center justify-center text-text-muted text-sm">
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
