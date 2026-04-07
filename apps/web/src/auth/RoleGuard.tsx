import React from 'react';
import { useAuth } from './useAuth';
import type { Permission } from './types';

interface RoleGuardProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ permission, children, fallback = null }: RoleGuardProps) {
  const { permissions } = useAuth();
  return permissions[permission] ? <>{children}</> : <>{fallback}</>;
}
