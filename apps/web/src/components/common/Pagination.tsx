import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { clsx } from 'clsx';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 25, 50],
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-[var(--color-text-muted)]">
          Showing {totalItems} {totalItems === 1 ? 'item' : 'items'}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-4">
        <span className="text-xs text-[var(--color-text-muted)]">
          {startItem}–{endItem} of {totalItems}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-text-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-text-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {getPageNumbers().map((page, i) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-xs text-[var(--color-text-light)]">…</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={clsx(
                'min-w-[28px] h-7 text-xs font-medium rounded transition-colors',
                page === currentPage
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-main)]',
              )}
            >
              {page}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-text-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-[var(--color-text-light)] hover:text-[var(--color-text-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
