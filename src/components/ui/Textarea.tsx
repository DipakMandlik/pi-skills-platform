import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

interface TextareaProps extends HTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  resize?: 'none' | 'both' | 'vertical' | 'horizontal';
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, resize = 'vertical', id, ...props }, ref) => {
    const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'flex min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary',
            'disabled:pointer-events-none disabled:opacity-50',
            {
              'resize-none': resize === 'none',
              'resize': resize === 'both',
              'resize-y': resize === 'vertical',
              'resize-x': resize === 'horizontal',
            },
            error && 'border-error focus-visible:ring-error/40 focus-visible:border-error',
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-xs text-error" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${textareaId}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export { Textarea };
