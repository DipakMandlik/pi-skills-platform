import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  footer,
}: ModalProps) {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              'relative w-full bg-white rounded-2xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden',
              {
                'max-w-sm': size === 'sm',
                'max-w-md': size === 'md',
                'max-w-lg': size === 'lg',
                'max-w-2xl': size === 'xl',
              },
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-0">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-main)]">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 -mt-1 -mr-1 text-[var(--color-text-light)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface)] rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]/50">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
