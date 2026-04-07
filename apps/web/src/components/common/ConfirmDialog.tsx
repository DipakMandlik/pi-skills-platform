import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';
import { Button } from './Button';
import { clsx } from 'clsx';

type ConfirmVariant = 'danger' | 'warning' | 'info' | 'default';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

const variantConfig: Record<ConfirmVariant, { icon: React.ReactNode; iconBg: string; iconColor: string; confirmVariant: 'danger' | 'primary' }> = {
  danger: {
    icon: <AlertCircle className="w-5 h-5" />,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    confirmVariant: 'danger',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    confirmVariant: 'primary',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    confirmVariant: 'primary',
  },
  default: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    confirmVariant: 'primary',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
}: ConfirmDialogProps) {
  const config = variantConfig[variant];

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
          >
            <div className="p-5">
              <div className="flex items-start gap-3.5">
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', config.iconBg, config.iconColor)}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-main)] mb-1">{title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{message}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-[var(--color-surface)]/50 border-t border-[var(--color-border)]">
              <Button variant="secondary" size="sm" onClick={onClose}>{cancelLabel}</Button>
              <Button variant={config.confirmVariant} size="sm" onClick={() => { onConfirm(); onClose(); }}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
