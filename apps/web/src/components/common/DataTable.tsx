import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronUp, ChevronDown, Search, ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';
import { Pagination } from './Pagination';
import { EmptyState } from './EmptyState';

export interface Column<T = Record<string, unknown>> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T = Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  rowKey?: string;
  compact?: boolean;
  paginated?: boolean;
  defaultPageSize?: number;
  striped?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

export function DataTable<T extends object>({
  columns,
  data,
  emptyMessage = 'No data available',
  emptyIcon,
  searchable = false,
  searchPlaceholder = 'Search...',
  onRowClick,
  rowKey = 'id',
  compact = false,
  paginated = false,
  defaultPageSize = 10,
  striped = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = (row as Record<string, unknown>)[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      }),
    );
  }, [data, search, columns]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const pagedData = paginated
    ? sortedData.slice((page - 1) * pageSize, page * pageSize)
    : sortedData;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <div className="flex flex-col">
      {searchable && (
        <div className="mb-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-light)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/10 transition-all"
            />
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[var(--color-surface)]/80 border-b border-[var(--color-border)]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={clsx(
                      'text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] select-none',
                      compact ? 'px-3 py-2.5' : 'px-4 py-3',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.sortable && 'cursor-pointer hover:text-[var(--color-text-main)] transition-colors group/sort',
                    )}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && (
                        sortKey === col.key ? (
                          sortDir === 'asc'
                            ? <ChevronUp className="w-3 h-3 text-[var(--color-accent)]" />
                            : <ChevronDown className="w-3 h-3 text-[var(--color-accent)]" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-0 group-hover/sort:opacity-50 transition-opacity" />
                        )
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <div className={clsx('flex items-center justify-center', compact ? 'py-8' : 'py-12')}>
                      <EmptyState
                        icon={emptyIcon}
                        title={emptyMessage}
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                pagedData.map((row, rowIdx) => (
                  <motion.tr
                    key={String((row as Record<string, unknown>)[rowKey] ?? rowIdx)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: rowIdx * 0.02, duration: 0.2 }}
                    className={clsx(
                      'transition-all duration-150',
                      onRowClick && 'cursor-pointer row-hover-glow',
                      !onRowClick && 'hover:bg-[var(--color-surface)]/50',
                      striped && rowIdx % 2 === 1 && 'bg-[var(--color-surface)]/30',
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={clsx(
                          'text-sm text-[var(--color-text-main)]',
                          compact ? 'px-3 py-2.5' : 'px-4 py-3',
                          col.align === 'center' && 'text-center',
                          col.align === 'right' && 'text-right',
                        )}
                      >
                        {col.render
                          ? col.render((row as Record<string, unknown>)[col.key], row, rowIdx)
                          : ((row as Record<string, unknown>)[col.key] as React.ReactNode) ?? '—'}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {paginated && sortedData.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={sortedData.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
