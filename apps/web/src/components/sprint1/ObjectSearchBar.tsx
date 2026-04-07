import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mcpClient } from '../../api/mcpClient';

interface TableStats {
  table_name: string;
  row_count: number;
  bytes: number;
  created: string | null;
  last_altered: string | null;
  cluster_by: string | null;
}

interface ColumnProfile {
  column_name: string;
  data_type: string;
  null_count: number;
  null_pct: number;
  distinct_count: number;
  min_value: string | null;
  max_value: string | null;
  top_values: Array<{ value: string; count: number }>;
}

interface SearchResult {
  database: string;
  schema: string;
  name: string;
  type: string;
}

export function ObjectSearchBar() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedTable, setSelectedTable] = useState<{ database: string; schema: string; name: string } | null>(null);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const result = await mcpClient.callTool<{ results: SearchResult[] }>({
        name: 'search_objects',
        arguments: { keyword: keyword.trim() },
      });

      if (result.ok && result.result) {
        setResults(result.result.results || []);
        setShowResults(true);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [keyword, handleSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        const input = document.getElementById('object-search-input');
        input?.focus();
      }
      if (e.key === 'Escape') {
        setShowResults(false);
        setKeyword('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative">
       <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus-within:border-[var(--color-accent)] transition-colors">
        <Icons.Search className="w-4 h-4 text-gray-400" />
        <input
          id="object-search-input"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onFocus={() => setShowResults(true)}
          placeholder="Search tables, views... (⌘F)"
          className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400"
        />
        {loading && <Icons.Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        {keyword && (
          <button onClick={() => { setKeyword(''); setResults([]); }} className="p-0.5 hover:bg-gray-200 rounded">
            <Icons.X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showResults && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50"
          >
            <div className="p-2 border-b border-gray-100">
              <span className="text-[10px] font-mono text-gray-400 uppercase">{results.length} results</span>
            </div>
            {results.map((result, i) => (
              <button
                key={i}
                onClick={() => {
                  setSelectedTable({ database: result.database, schema: result.schema, name: result.name });
                  setShowResults(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <Icons.Database className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{result.name}</div>
                  <div className="text-[10px] font-mono text-gray-400">
                    {result.database}.{result.schema}
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                   result.type === 'VIEW' ? 'bg-purple-50 text-purple-600' : 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                }`}>
                  {result.type}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {selectedTable && (
        <TableDetailDrawer
          database={selectedTable.database}
          schema={selectedTable.schema}
          table={selectedTable.name}
          onClose={() => setSelectedTable(null)}
        />
      )}
    </div>
  );
}

function TableDetailDrawer({ database, schema, table, onClose }: { database: string; schema: string; table: string; onClose: () => void }) {
  const [stats, setStats] = useState<TableStats | null>(null);
  const [columns, setColumns] = useState<Array<{ name: string; type: string; nullable: string }>>([]);
  const [columnProfiles, setColumnProfiles] = useState<Map<string, ColumnProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, descRes] = await Promise.all([
          mcpClient.callTool<TableStats>({
            name: 'get_table_stats',
            arguments: { database, schema, table },
          }),
          mcpClient.callTool<{ columns: Array<{ name: string; type: string; nullable: string }> }>({
            name: 'describe_table',
            arguments: { database, schema, table },
          }),
        ]);

        if (statsRes.ok && statsRes.result) setStats(statsRes.result);
        if (descRes.ok && descRes.result) setColumns(descRes.result.columns || []);
      } catch (err) {
        console.error('Failed to fetch table details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [database, schema, table]);

  const fetchColumnProfile = async (column: string) => {
    if (columnProfiles.has(column)) {
      setActiveColumn(column);
      return;
    }

    try {
      const result = await mcpClient.callTool<ColumnProfile>({
        name: 'get_column_profile',
        arguments: { database, schema, table, column },
      });

      if (result.ok && result.result) {
        setColumnProfiles(prev => new Map(prev).set(column, result.result));
        setActiveColumn(column);
      }
    } catch (err) {
      console.error('Failed to fetch column profile:', err);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes > 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
    return `${(bytes / 1e3).toFixed(2)} KB`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl max-h-[80vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                 <Icons.Database className="w-4 h-4 text-[var(--color-accent)]" />
                <h3 className="font-semibold text-gray-800">{table}</h3>
              </div>
              <div className="text-xs font-mono text-gray-400 mt-0.5">{database}.{schema}</div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <Icons.X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                 <Icons.Loader2 className="w-6 h-6 text-[var(--color-accent)] animate-spin" />
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Stats */}
                {stats && (
                  <div className="grid grid-cols-3 gap-3">
                     <div className="bg-[var(--color-accent-light)] rounded-lg p-3">
                       <div className="text-[10px] font-mono text-[var(--color-accent)] uppercase">Rows</div>
                       <div className="text-lg font-semibold text-[var(--color-accent)]">{stats.row_count.toLocaleString()}</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-[10px] font-mono text-purple-600 uppercase">Size</div>
                      <div className="text-lg font-semibold text-purple-800">{formatBytes(stats.bytes)}</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <div className="text-[10px] font-mono text-emerald-600 uppercase">Columns</div>
                      <div className="text-lg font-semibold text-emerald-800">{columns.length}</div>
                    </div>
                  </div>
                )}

                {/* Cluster */}
                {stats?.cluster_by && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-[10px] font-mono text-amber-600 uppercase mb-1">Cluster Key</div>
                    <code className="text-sm font-mono text-amber-800">{stats.cluster_by}</code>
                  </div>
                )}

                {/* Columns */}
                <div>
                  <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">Columns</div>
                  <div className="space-y-1">
                    {columns.map((col, i) => (
                      <div
                        key={i}
                        onClick={() => fetchColumnProfile(col.name)}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <Icons.Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="flex-1 text-sm font-medium text-gray-700">{col.name}</span>
                        <span className="text-xs font-mono text-gray-500">{col.type}</span>
                        {col.nullable === 'Y' && (
                          <span className="text-[9px] font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">NULLABLE</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column Profile */}
                {activeColumn && columnProfiles.has(activeColumn) && (
                   <div className="bg-[var(--color-accent-light)] border-[var(--color-accent)] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                       <div className="text-xs font-semibold text-[var(--color-accent)]">{activeColumn} Profile</div>
                       <button onClick={() => setActiveColumn(null)} className="p-0.5 hover:bg-[var(--color-accent-light)] rounded">
                         <Icons.X className="w-3 h-3 text-[var(--color-accent)]" />
                      </button>
                    </div>
                    {columnProfiles.get(activeColumn) && (
                      <ColumnProfileView profile={columnProfiles.get(activeColumn)!} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ColumnProfileView({ profile }: { profile: ColumnProfile }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
           <div className="text-lg font-semibold text-[var(--color-accent-hover)]">{profile.null_pct}%</div>
          <div className="text-[10px] font-mono text-blue-600">Null Rate</div>
        </div>
        <div className="text-center">
                   <div className="text-lg font-semibold text-[var(--color-accent)]">{profile.distinct_count.toLocaleString()}</div>
           <div className="text-[10px] font-mono text-[var(--color-accent)]">Distinct</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-blue-800">{profile.null_count.toLocaleString()}</div>
           <div className="text-[10px] font-mono text-[var(--color-accent)]">Nulls</div>
        </div>
      </div>

      {(profile.min_value || profile.max_value) && (
        <div className="flex items-center gap-2 text-xs">
           <span className="font-mono text-[var(--color-accent)]">Min:</span>
           <span className="font-mono text-[var(--color-accent)]">{profile.min_value}</span>
           <span className="text-[var(--color-accent)];opacity-0.6">|</span>
           <span className="font-mono text-[var(--color-accent)]">Max:</span>
          <span className="font-mono text-blue-800">{profile.max_value}</span>
        </div>
      )}

      {profile.top_values.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-blue-600 uppercase mb-1">Top Values</div>
          <div className="space-y-1">
            {profile.top_values.slice(0, 5).map((v, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-mono text-blue-800 truncate">{v.value}</span>
                <span className="font-mono text-blue-600 ml-2">{v.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
