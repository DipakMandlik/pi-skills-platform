import { cn } from '../../lib/cn';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = 'rectangular', width, height }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-surface',
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
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
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

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton variant="text" width={120} height={14} className="mb-1" />
          <Skeleton variant="text" width={80} height={12} />
        </div>
      </div>
      <Skeleton variant="text" width="100%" height={12} className="mb-2" />
      <Skeleton variant="text" width="75%" height={12} />
    </div>
  );
}

export function PageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton variant="text" width={180} height={24} />
          <Skeleton variant="text" width={120} height={14} className="mt-2" />
        </div>
        <Skeleton variant="rectangular" width={100} height={36} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
