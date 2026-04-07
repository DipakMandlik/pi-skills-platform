import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  interactive?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding = 'md', hover = false, interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-border bg-surface-elevated',
          {
            'p-0': padding === 'none',
            'p-2': padding === 'xs',
            'p-3': padding === 'sm',
            'p-4': padding === 'md',
            'p-6': padding === 'lg',
          },
          hover && 'hover:border-border-hover hover:shadow-sm transition-all duration-150',
          interactive && 'cursor-pointer hover:border-border-hover hover:shadow-md transition-all duration-150 active:scale-[0.99]',
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = 'Card';

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

function CardHeader({ className, title, subtitle, action, ...props }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)} {...props}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn('mt-4', className)} {...props} />;
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div className={cn('flex items-center gap-2 mt-4 pt-4 border-t border-border', className)} {...props} />
  );
}

export { Card, CardHeader, CardContent, CardFooter };
