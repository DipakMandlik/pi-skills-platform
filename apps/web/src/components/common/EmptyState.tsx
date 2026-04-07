import React from 'react';
import { clsx } from 'clsx';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className,
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-[var(--color-surface)] flex items-center justify-center mb-4 text-[var(--color-text-light)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-text-main)] mb-1">{title}</h3>
      {message && (
        <p className="text-xs text-[var(--color-text-muted)] max-w-xs mb-4">{message}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
