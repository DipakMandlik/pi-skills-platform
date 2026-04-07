import React from 'react';
import { useAuth } from '../auth';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { UserDashboard } from '../components/dashboard/UserDashboard';

const ADMIN_ROLES = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'SECURITY_ADMIN', 'SECURITYADMIN'];

export function DashboardPage() {
  const { hasRole } = useAuth();
  const isAdmin = ADMIN_ROLES.some(r => hasRole(r));
  return isAdmin ? <AdminDashboard /> : <UserDashboard />;
}
