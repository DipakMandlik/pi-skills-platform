import React from 'react';
import { clsx } from 'clsx';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'group relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 overflow-hidden',
        {
          'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-sm hover:shadow-md focus:ring-[var(--color-accent)]/40 disabled:bg-[var(--color-accent)]/50 active:scale-[0.98]':
            variant === 'primary',
          'bg-white text-[var(--color-text-main)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:shadow-sm focus:ring-[var(--color-accent)]/20 active:scale-[0.98]':
            variant === 'secondary',
          'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface)] focus:ring-[var(--color-accent)]/20':
            variant === 'ghost',
          'bg-[var(--color-error)] text-white hover:bg-red-600 shadow-sm hover:shadow-md focus:ring-red-500/40 disabled:bg-red-300 active:scale-[0.98]':
            variant === 'danger',
          'bg-transparent text-[var(--color-accent)] border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-lighter)] hover:border-[var(--color-accent)]/50 focus:ring-[var(--color-accent)]/20':
            variant === 'outline',
        },
        {
          'text-xs gap-1.5 h-8 px-3 rounded-lg': size === 'sm',
          'text-sm gap-2 h-9 px-4': size === 'md',
          'text-sm gap-2.5 h-10 px-5': size === 'lg',
        },
        (disabled || loading) && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {/* Shine effect on hover */}
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />

      {loading ? (
        <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin relative z-10" />
      ) : icon ? (
        <span className="shrink-0 relative z-10">{icon}</span>
      ) : null}
      {children && <span className="relative z-10">{children}</span>}
      {iconRight && !loading && (
        <span className="shrink-0 relative z-10">{iconRight}</span>
      )}
    </button>
  );
}
