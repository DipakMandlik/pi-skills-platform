import React, { useState, useRef } from 'react';
import { clsx } from 'clsx';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  ripple?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  ripple = true,
  children,
  className,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (ripple && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      setRipples((prev) => [...prev, { x, y, id }]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    }
    onClick?.(e);
  };

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className={clsx(
        'group relative inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 overflow-hidden select-none',
        {
          'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-sm hover:shadow-md focus:ring-[var(--color-accent)]/40 active:scale-[0.97]':
            variant === 'primary',
          'bg-[var(--color-surface-elevated)] text-[var(--color-text-main)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-strong)] hover:shadow-sm focus:ring-[var(--color-accent)]/20 active:scale-[0.97]':
            variant === 'secondary',
          'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface)] focus:ring-[var(--color-accent)]/20 active:scale-[0.97]':
            variant === 'ghost',
          'bg-[var(--color-error)] text-white hover:bg-red-600 shadow-sm hover:shadow-md focus:ring-red-500/40 active:scale-[0.97]':
            variant === 'danger',
          'bg-transparent text-[var(--color-accent)] border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-lighter)] hover:border-[var(--color-accent)]/50 focus:ring-[var(--color-accent)]/20 active:scale-[0.97]':
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
      {/* Shine effect */}
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none" />

      {/* Ripple effects */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute rounded-full bg-white/30 pointer-events-none"
          style={{
            left: r.x - 15,
            top: r.y - 15,
            width: 30,
            height: 30,
            animation: 'ripple 0.6s ease-out forwards',
          }}
        />
      ))}

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
