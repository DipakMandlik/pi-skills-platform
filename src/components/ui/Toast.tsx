import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/cn';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastOptions {
  duration?: number;
  action?: { label: string; onClick: () => void };
  title?: string;
}

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-success" />,
  error: <AlertCircle className="w-4 h-4 text-error" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  info: <Info className="w-4 h-4 text-info" />,
};

const toastBorderColors: Record<ToastType, string> = {
  success: 'border-success/20',
  error: 'border-error/20',
  warning: 'border-warning/20',
  info: 'border-info/20',
};

const progressBarColors: Record<ToastType, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
};

interface ToastContextValue {
  toast: (type: ToastType, message: string, options?: number | ToastOptions) => void;
  success: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  error: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  warning: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  info: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: ToastType, message: string, options?: ToastOptions) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message, duration: options?.duration ?? 4000, action: options?.action, title: options?.title }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue: ToastContextValue = {
    toast: (type, msg, opts) => addToast(type, msg, typeof opts === 'number' ? { duration: opts } : opts),
    success: (msg, opts) => addToast('success', msg, opts),
    error: (msg, opts) => addToast('error', msg, opts),
    warning: (msg, opts) => addToast('warning', msg, opts),
    info: (msg, opts) => addToast('info', msg, opts),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 max-w-sm pointer-events-none" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} data={t} onDismiss={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!data.duration || data.duration <= 0) return;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / data.duration!) * 100);
      setProgress(remaining);
      if (remaining > 0) requestAnimationFrame(tick);
      else onDismiss();
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data.duration, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95, x: 20 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95, x: 20 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'pointer-events-auto flex flex-col rounded-xl border bg-surface-elevated shadow-lg overflow-hidden',
        toastBorderColors[data.type],
      )}
      role="alert"
    >
      <div className="flex items-start gap-2.5 px-4 py-3">
        <span className="shrink-0 mt-0.5">{toastIcons[data.type]}</span>
        <div className="flex-1 min-w-0">
          {data.title && <p className="text-sm font-semibold text-foreground">{data.title}</p>}
          <p className={cn('text-sm leading-snug text-foreground', data.title && 'mt-0.5')}>{data.message}</p>
          {data.action && (
            <button
              onClick={data.action.onClick}
              className="mt-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
            >
              {data.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 p-0.5 text-muted hover:text-foreground transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {data.duration && data.duration > 0 && (
        <div className="h-0.5 bg-surface">
          <div
            className={cn('h-full transition-none', progressBarColors[data.type])}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}
