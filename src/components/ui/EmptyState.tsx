import { type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

export function EmptyState({ icon, title, description, action, secondaryAction, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4 text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
