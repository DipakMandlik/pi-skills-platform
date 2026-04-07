import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary-lighter text-primary',
        secondary: 'bg-surface text-muted',
        success: 'bg-success-light text-success',
        warning: 'bg-warning-light text-warning',
        error: 'bg-error-light text-error',
        info: 'bg-info-light text-info',
        outline: 'border border-border text-muted',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-0.5',
        md: 'text-xs px-2 py-0.5',
        lg: 'text-sm px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
