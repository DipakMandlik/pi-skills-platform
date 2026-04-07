import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: 'right' | 'left';
}

export function Drawer({ isOpen, onClose, title, children, size = 'md', side = 'right' }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const sizeMap = {
    sm: 'w-[320px]',
    md: 'w-[420px]',
    lg: 'w-[560px]',
    xl: 'w-[720px]',
  };

  const sideClasses = {
    right: side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
    left: side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal" role="dialog" aria-modal="true">
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute top-0 bottom-0 bg-surface-elevated shadow-2xl flex flex-col overflow-hidden',
              sizeMap[size],
              sideClasses[side],
              'border-border',
            )}
          >
            {title && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
