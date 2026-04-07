import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, Database, Shield, Key, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

interface ConnectionStep {
  id: string;
  label: string;
  icon: React.ElementType;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
}

interface ConnectionProgressProps {
  steps?: { id: string; label: string; icon?: React.ElementType }[];
  onComplete?: () => void;
  autoAdvance?: boolean;
  intervalMs?: number;
}

const DEFAULT_STEPS = [
  { id: 'init', label: 'Initializing connection...', icon: Database },
  { id: 'auth', label: 'Authenticating credentials...', icon: Key },
  { id: 'verify', label: 'Verifying Snowflake access...', icon: Shield },
  { id: 'meta', label: 'Fetching metadata...', icon: Sparkles },
  { id: 'ready', label: 'Ready', icon: CheckCircle2 },
];

export function ConnectionProgress({
  steps = DEFAULT_STEPS,
  onComplete,
  autoAdvance = true,
  intervalMs = 800,
}: ConnectionProgressProps) {
  const [stepStates, setStepStates] = useState<ConnectionStep[]>(
    steps.map((s, i) => ({
      ...s,
      icon: s.icon || CheckCircle2,
      status: i === 0 ? 'active' : 'pending',
    })),
  );
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!autoAdvance) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= steps.length) {
          clearInterval(timer);
          onComplete?.();
          return prev;
        }
        setStepStates((states) =>
          states.map((s, i) => ({
            ...s,
            status: i < next ? 'done' : i === next ? 'active' : 'pending',
          })),
        );
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [autoAdvance, steps.length, intervalMs, onComplete]);

  return (
    <div className="space-y-2">
      {stepStates.map((step, i) => {
        const Icon = step.icon;
        return (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className={clsx(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300',
              step.status === 'active' && 'bg-blue-50 border border-blue-200',
              step.status === 'done' && 'bg-emerald-50/50',
              step.status === 'pending' && 'opacity-40',
              step.status === 'error' && 'bg-red-50 border border-red-200',
            )}
          >
            <div
              className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all',
                step.status === 'active' && 'bg-blue-100 text-blue-600',
                step.status === 'done' && 'bg-emerald-100 text-emerald-600',
                step.status === 'pending' && 'bg-gray-100 text-gray-400',
                step.status === 'error' && 'bg-red-100 text-red-500',
              )}
            >
              {step.status === 'active' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : step.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={clsx(
                  'text-sm font-medium transition-colors',
                  step.status === 'active' && 'text-blue-700',
                  step.status === 'done' && 'text-emerald-700',
                  step.status === 'pending' && 'text-[var(--color-text-light)]',
                  step.status === 'error' && 'text-red-600',
                )}
              >
                {step.label}
              </span>
            </div>
            {step.status === 'active' && (
              <div className="flex gap-0.5">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, delay: dot * 0.2, repeat: Infinity }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
