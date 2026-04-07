import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { Sparkline } from './Sparkline';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'cyan';
  delay?: number;
  sparkline?: number[];
  live?: boolean;
}

const colorMap = {
  blue: {
    bg: 'metric-bg-blue',
    icon: 'metric-icon-blue',
    iconBg: 'metric-icon-bg-blue',
    value: 'metric-value-blue',
    sparkColor: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.06)',
  },
  emerald: {
    bg: 'metric-bg-emerald',
    icon: 'metric-icon-emerald',
    iconBg: 'metric-icon-bg-emerald',
    value: 'metric-value-emerald',
    sparkColor: '#10b981',
    glow: 'rgba(16, 185, 129, 0.06)',
  },
  amber: {
    bg: 'metric-bg-amber',
    icon: 'metric-icon-amber',
    iconBg: 'metric-icon-bg-amber',
    value: 'metric-value-amber',
    sparkColor: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.06)',
  },
  purple: {
    bg: 'metric-bg-purple',
    icon: 'metric-icon-purple',
    iconBg: 'metric-icon-bg-purple',
    value: 'metric-value-purple',
    sparkColor: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.06)',
  },
  rose: {
    bg: 'metric-bg-rose',
    icon: 'metric-icon-rose',
    iconBg: 'metric-icon-bg-rose',
    value: 'metric-value-rose',
    sparkColor: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.06)',
  },
  cyan: {
    bg: 'metric-bg-cyan',
    icon: 'metric-icon-cyan',
    iconBg: 'metric-icon-bg-cyan',
    value: 'metric-value-cyan',
    sparkColor: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.06)',
  },
};

function AnimatedCounter({ value, duration = 800 }: { value: string | number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const numericValue = typeof value === 'string' ? parseInt(value.replace(/,/g, ''), 10) || 0 : value;

  useEffect(() => {
    if (isNaN(numericValue)) return;
    let start = 0;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * numericValue));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [numericValue, duration]);

  if (isNaN(numericValue)) return <>{value}</>;
  return <>{display.toLocaleString()}</>;
}

export function MetricCard({
  label,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  color = 'blue',
  delay = 0,
  sparkline,
  live = false,
}: MetricCardProps) {
  const colors = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="group relative bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-border-strong)] transition-all duration-150 overflow-hidden"
      style={{ '--glow-color': colors.glow } as React.CSSProperties}
    >
      {/* Subtle gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top right, ${colors.glow}, transparent 70%)` }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              {label}
            </span>
            {live && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
            )}
          </div>
          {icon && (
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-150 group-hover:scale-110', colors.iconBg)}>
              <span className={colors.icon}>{icon}</span>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-end gap-2">
              <span className={clsx('text-[26px] font-extrabold tracking-tight leading-none', colors.value)}>
                <AnimatedCounter value={value} />
              </span>
              {trend && trendValue && (
                <div
                  className={clsx(
                    'flex items-center gap-0.5 text-[11px] font-semibold mb-0.5 px-1.5 py-0.5 rounded-full',
                    trend === 'up' && 'trend-up',
                    trend === 'down' && 'trend-down',
                    trend === 'flat' && 'trend-flat',
                  )}
                >
                  {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                  {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                  {trend === 'flat' && <Minus className="w-3 h-3" />}
                  {trendValue}
                </div>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5">{subtitle}</p>
            )}
          </div>

          {sparkline && sparkline.length > 2 && (
            <div className="w-20 shrink-0">
              <Sparkline data={sparkline} color={colors.sparkColor} height={28} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
