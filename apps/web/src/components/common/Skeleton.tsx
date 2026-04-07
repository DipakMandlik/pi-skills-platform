import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = 'rectangular', width, height }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-[var(--color-surface)]',
        {
          'rounded-md': variant === 'text',
          'rounded-full': variant === 'circular',
          'rounded-lg': variant === 'rectangular',
        },
        className,
      )}
      style={{
        width: width ?? (variant === 'text' ? '100%' : undefined),
        height: height ?? (variant === 'text' ? '1em' : undefined),
      }}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <Skeleton variant="text" width={80} height={12} />
        <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
      </div>
      <Skeleton variant="text" width={60} height={28} />
      <Skeleton variant="text" width={100} height={12} className="mt-2" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton variant="text" height={14} />
        </td>
      ))}
    </tr>
  );
}
