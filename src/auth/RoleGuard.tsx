import React from 'react';
import { useAuth } from './useAuth';

interface RoleGuardProps {
  feature?: string;
  role?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ feature, role, children, fallback = null }: RoleGuardProps) {
  const { hasFeature, hasRole } = useAuth();
  if (feature && !hasFeature(feature)) return <>{fallback}</>;
  if (role && !hasRole(role)) return <>{fallback}</>;
  return <>{children}</>;
}
