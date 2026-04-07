import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-10 w-10 text-base',
  xl: 'h-12 w-12 text-lg',
};

const statusSizeMap = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
};

const statusColorMap = {
  online: 'bg-success',
  offline: 'bg-muted',
  busy: 'bg-error',
  away: 'bg-warning',
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, initials, size = 'md', status, ...props }, ref) => {
    const initialsContent = initials || (alt ? alt.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?');
    const colors = [
      'bg-primary-light text-primary',
      'bg-accent-light text-accent',
      'bg-success-light text-success',
      'bg-warning-light text-warning',
      'bg-info-light text-info',
    ];
    const colorIndex = initialsContent.charCodeAt(0) % colors.length;

    return (
      <div ref={ref} className={cn('relative inline-flex shrink-0', className)} {...props}>
        {src ? (
          <img
            src={src}
            alt={alt || ''}
            className={cn('rounded-full object-cover', sizeMap[size])}
          />
        ) : (
          <div className={cn('flex items-center justify-center rounded-full font-medium', sizeMap[size], colors[colorIndex])}>
            {initialsContent}
          </div>
        )}
        {status && (
          <span
            className={cn(
              'absolute bottom-0 right-0 rounded-full border-2 border-surface-elevated',
              statusSizeMap[size],
              statusColorMap[status],
            )}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';

export { Avatar };
