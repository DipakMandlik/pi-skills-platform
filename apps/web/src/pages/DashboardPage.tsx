import React from 'react';
import { useAuth } from '../auth';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { UserDashboard } from '../components/dashboard/UserDashboard';

export function DashboardPage() {
  const { permissions } = useAuth();
  return permissions.manageUsers ? <AdminDashboard /> : <UserDashboard />;
}
