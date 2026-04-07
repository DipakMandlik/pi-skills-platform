import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4" />,
  error: <AlertCircle className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
};

const toastStyles: Record<ToastType, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
};

const toastIconStyles: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

const progressBarColors: Record<ToastType, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
};

// ── Toast Context ──

interface ToastContextValue {
  toast: (type: ToastType, message: string, duration?: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
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
      className={clsx(
        'flex flex-col rounded-xl border shadow-lg backdrop-blur-sm overflow-hidden',
        toastStyles[data.type],
      )}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span className={clsx('shrink-0 mt-0.5', toastIconStyles[data.type])}>
          {toastIcons[data.type]}
        </span>
        <p className="flex-1 text-sm font-medium leading-snug">{data.message}</p>
        <button
          onClick={onDismiss}
          className="shrink-0 p-0.5 opacity-50 hover:opacity-100 transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {data.duration && data.duration > 0 && (
        <div className="h-0.5 bg-black/5">
          <div
            className={clsx('h-full', progressBarColors[data.type])}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}
