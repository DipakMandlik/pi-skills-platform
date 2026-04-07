import { type VariantProps, cva } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm hover:shadow-md focus-visible:ring-primary/40',
        secondary: 'bg-surface text-foreground border border-border hover:bg-surface-hover hover:border-border-hover focus-visible:ring-primary/20',
        ghost: 'bg-transparent text-muted hover:text-foreground hover:bg-surface focus-visible:ring-primary/20',
        danger: 'bg-error text-error-foreground hover:bg-error-hover shadow-sm focus-visible:ring-error/40',
        outline: 'bg-transparent text-primary border border-primary/30 hover:bg-primary-lighter hover:border-primary/50 focus-visible:ring-primary/20',
        success: 'bg-success text-success-foreground hover:bg-success-hover shadow-sm focus-visible:ring-success/40',
      },
      size: {
        xs: 'text-xs gap-1.5 h-7 px-2.5 rounded-md',
        sm: 'text-xs gap-1.5 h-8 px-3 rounded-md',
        md: 'text-sm gap-2 h-9 px-4',
        lg: 'text-sm gap-2.5 h-10 px-5',
        xl: 'text-base gap-2.5 h-12 px-6',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
        'icon-lg': 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, icon, iconRight, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
        {iconRight && !loading && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
