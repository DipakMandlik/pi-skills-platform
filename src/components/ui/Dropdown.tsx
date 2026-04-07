import { useState, useRef, useEffect, type ReactNode, type HTMLAttributes } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/cn';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end' | 'center';
  side?: 'bottom' | 'top';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Dropdown({ trigger, children, align = 'start', side = 'bottom', open: controlledOpen, onOpenChange }: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (val: boolean) => {
    setInternalOpen(val);
    onOpenChange?.(val);
  };

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const alignMap = {
    start: 'left-0',
    end: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  };

  const sideMap = {
    bottom: 'top-full mt-2',
    top: 'bottom-full mb-2',
  };

  return (
    <div className="relative inline-block">
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}>
        {trigger}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute z-[1000] min-w-[200px] rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-1.5',
              alignMap[align],
              sideMap[side],
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DropdownItemProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  destructive?: boolean;
  shortcut?: string;
}

export function DropdownItem({ className, icon, destructive, shortcut, children, ...props }: DropdownItemProps) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
        destructive
          ? 'text-error hover:bg-error-light/50'
          : 'text-foreground hover:bg-surface',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
      {shortcut && <span className="text-xs text-muted font-mono">{shortcut}</span>}
    </button>
  );
}

interface DropdownSeparatorProps {
  className?: string;
}

export function DropdownSeparator({ className }: DropdownSeparatorProps) {
  return <div className={cn('my-1 h-px bg-border', className)} />;
}

interface DropdownLabelProps {
  className?: string;
  children: ReactNode;
}

export function DropdownLabel({ className, children }: DropdownLabelProps) {
  return <div className={cn('px-2.5 py-1.5 text-xs font-medium text-muted', className)}>{children}</div>;
}
