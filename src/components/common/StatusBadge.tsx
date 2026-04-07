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
  active: { bg: 'status-bg-emerald', text: '', dot: 'status-dot-emerald', defaultLabel: 'Active', icon: CheckCircle2 },
  expired: { bg: 'status-bg-amber', text: '', dot: 'status-dot-amber', defaultLabel: 'Expired', icon: Clock },
  revoked: { bg: 'status-bg-red', text: '', dot: 'status-dot-red', defaultLabel: 'Revoked', icon: XCircle },
  pending: { bg: 'status-bg-blue', text: '', dot: 'status-dot-blue', defaultLabel: 'Pending', icon: Clock },
  success: { bg: 'status-bg-emerald', text: '', dot: 'status-dot-emerald', defaultLabel: 'Success', icon: CheckCircle2 },
  warning: { bg: 'status-bg-amber', text: '', dot: 'status-dot-amber', defaultLabel: 'Warning', icon: AlertTriangle },
  error: { bg: 'status-bg-red', text: '', dot: 'status-dot-red', defaultLabel: 'Error', icon: AlertCircle },
  info: { bg: 'status-bg-blue', text: '', dot: 'status-dot-blue', defaultLabel: 'Info', icon: Shield },
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
