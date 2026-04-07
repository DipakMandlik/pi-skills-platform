import React from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, AlertCircle, AlertTriangle, Clock, XCircle, Shield } from 'lucide-react';

type StatusType = 'active' | 'expired' | 'revoked' | 'pending' | 'success' | 'warning' | 'error' | 'info';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

const statusConfig: Record<StatusType, { bg: string; text: string; dot: string; defaultLabel: string; icon: React.ElementType }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', defaultLabel: 'Active', icon: CheckCircle2 },
  expired: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', defaultLabel: 'Expired', icon: Clock },
  revoked: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400', defaultLabel: 'Revoked', icon: XCircle },
  pending: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400', defaultLabel: 'Pending', icon: Clock },
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', defaultLabel: 'Success', icon: CheckCircle2 },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', defaultLabel: 'Warning', icon: AlertTriangle },
  error: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400', defaultLabel: 'Error', icon: AlertCircle },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400', defaultLabel: 'Info', icon: Shield },
};

export function StatusBadge({ status, label, size = 'sm', dot = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        config.bg,
        config.text,
        size === 'sm' && 'text-[11px] px-2 py-0.5',
        size === 'md' && 'text-xs px-2.5 py-1',
        size === 'lg' && 'text-sm px-3 py-1.5',
      )}
    >
      {size === 'lg' ? (
        <Icon className="w-3.5 h-3.5" />
      ) : dot ? (
        <span className={clsx('w-1.5 h-1.5 rounded-full', config.dot)} />
      ) : null}
      {label || config.defaultLabel}
    </span>
  );
}
