import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import { ProtectedRoute } from './auth';
import { ToastProvider } from './components/common';
import { AppLayout } from './layouts/AppLayout';
import { GuestLayout } from './layouts/GuestLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SkillsPage } from './pages/SkillsPage';
import { SkillDetailPage } from './pages/SkillDetailPage';
import { ModelsPage } from './pages/ModelsPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { ROUTES } from './constants/routes';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Guest routes */}
            <Route element={<GuestLayout />}>
              <Route path={ROUTES.LOGIN} element={<LoginPage />} />
            </Route>

            {/* Authenticated routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to={ROUTES.DASHBOARD} replace />} />
              <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
              <Route path={ROUTES.WORKSPACE} element={<WorkspacePage />} />
              <Route
                path={ROUTES.SKILLS}
                element={
                  <ProtectedRoute requiredPermission="viewAllSkills">
                    <SkillsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.SKILL_DETAIL}
                element={
                  <ProtectedRoute requiredPermission="viewAllSkills">
                    <SkillDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.MODELS}
                element={
                  <ProtectedRoute requiredPermission="viewAllModels">
                    <ModelsPage />
                  </ProtectedRoute>
                }
              />
              <Route path={ROUTES.MONITORING} element={<MonitoringPage />} />
            </Route>

            <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />
            <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
