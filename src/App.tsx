import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider } from './auth';
import { ProtectedRoute } from './auth';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './layouts/AppLayout';
import { GuestLayout } from './layouts/GuestLayout';
import { LoginPage } from './pages/LoginPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { ROUTES } from './constants/routes';
import { PageSkeleton } from './components/ui/Skeleton';
import { ErrorBoundary } from './components/common/ErrorBoundary';

/* ── Static lazy imports (must live at module scope, NOT inside render) ── */
const resolveMod = (mod: Record<string, unknown>) => ({
  default: (mod.default || mod[Object.keys(mod)[0]]) as React.ComponentType<unknown>,
});

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(resolveMod));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then(resolveMod));
const SkillsPage = lazy(() => import('./pages/SkillsPage').then(resolveMod));
const SkillDetailPage = lazy(() => import('./pages/SkillDetailPage').then(resolveMod));
const SkillStudioPage = lazy(() => import('./pages/SkillStudioPage').then(resolveMod));
const ModelsPage = lazy(() => import('./pages/ModelsPage').then(resolveMod));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage').then(resolveMod));
const GovernanceAdminPage = lazy(() => import('./pages/GovernanceAdminPage').then(resolveMod));
const UsersPage = lazy(() => import('./pages/UsersPage').then(resolveMod));
const TeamsPage = lazy(() => import('./pages/TeamsPage').then(resolveMod));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(resolveMod));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(resolveMod));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {children}
    </Suspense>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="h-full"
      >
        <Routes location={location}>
          <Route element={<GuestLayout />}>
            <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to={ROUTES.DASHBOARD} replace />} />
            <Route path={ROUTES.DASHBOARD} element={<SuspenseWrapper><DashboardPage /></SuspenseWrapper>} />
            <Route path={ROUTES.WORKSPACE} element={<SuspenseWrapper><WorkspacePage /></SuspenseWrapper>} />
            <Route
              path={ROUTES.SKILLS}
              element={
                <SuspenseWrapper>
                  <ProtectedRoute requiredFeature="skills">
                    <SkillsPage />
                  </ProtectedRoute>
                </SuspenseWrapper>
              }
            />
            <Route path={ROUTES.SKILL_DETAIL} element={<SuspenseWrapper><ProtectedRoute requiredFeature="skills"><SkillDetailPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route path={ROUTES.SKILL_STUDIO} element={<SuspenseWrapper><ProtectedRoute requiredFeature="skills"><SkillStudioPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route path={ROUTES.SKILL_STUDIO_NEW} element={<SuspenseWrapper><ProtectedRoute requiredFeature="skills"><SkillStudioPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route
              path={ROUTES.MODELS}
              element={
                <SuspenseWrapper>
                  <ProtectedRoute requiredFeature="models">
                    <ModelsPage />
                  </ProtectedRoute>
                </SuspenseWrapper>
              }
            />
            <Route path={ROUTES.MONITORING} element={<SuspenseWrapper><ProtectedRoute requiredFeature="monitoring"><MonitoringPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route
              path={ROUTES.GOVERNANCE}
              element={
                <SuspenseWrapper>
                  <ProtectedRoute requiredFeature="governance_admin">
                    <GovernanceAdminPage />
                  </ProtectedRoute>
                </SuspenseWrapper>
              }
            />
            <Route path={ROUTES.USERS} element={<SuspenseWrapper><ProtectedRoute requiredFeature="users"><UsersPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route path={ROUTES.TEAMS} element={<SuspenseWrapper><ProtectedRoute requiredFeature="teams"><TeamsPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route path={ROUTES.ANALYTICS} element={<SuspenseWrapper><ProtectedRoute requiredFeature="analytics"><AnalyticsPage /></ProtectedRoute></SuspenseWrapper>} />
            <Route path={ROUTES.SETTINGS} element={<SuspenseWrapper><ProtectedRoute requiredFeature="settings"><SettingsPage /></ProtectedRoute></SuspenseWrapper>} />
          </Route>

          <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />
          <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AnimatedRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

