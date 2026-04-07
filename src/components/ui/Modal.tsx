import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
  closeOnOverlay?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  footer,
  closeOnOverlay = true,
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
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => closeOnOverlay && onClose()}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative w-full bg-surface-elevated rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden',
              {
                'max-w-sm': size === 'sm',
                'max-w-md': size === 'md',
                'max-w-lg': size === 'lg',
                'max-w-2xl': size === 'xl',
                'max-w-[95vw] max-h-[95vh]': size === 'full',
              },
            )}
          >
            <div className="flex items-start justify-between p-5 pb-0">
              <div className="min-w-0">
                <h2 id="modal-title" className="text-base font-semibold text-foreground">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-muted mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 -mt-1 -mr-1 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-surface/50">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
