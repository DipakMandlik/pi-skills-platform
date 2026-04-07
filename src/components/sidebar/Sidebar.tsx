import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, MessageSquare, Puzzle, Brain, Activity, Shield,
  Database, ChevronLeft, ChevronRight, LogOut, Settings, User, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../auth';
import { ROUTES } from '../../constants/routes';
import { mcpClient } from '../../api/mcpClient';
import { clsx } from 'clsx';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  feature?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard, feature: 'dashboard' },
  { path: ROUTES.WORKSPACE, label: 'Workspace', icon: MessageSquare, feature: 'workspace' },
  { path: ROUTES.SKILLS, label: 'Skills', icon: Puzzle, feature: 'skills' },
  { path: ROUTES.MODELS, label: 'Models', icon: Brain, feature: 'models' },
  { path: ROUTES.MONITORING, label: 'Monitoring', icon: Activity, feature: 'monitoring' },
  { path: ROUTES.GOVERNANCE, label: 'AI Governance', icon: Shield, feature: 'governance_admin' },
];

const USER_NAV_ITEMS: NavItem[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard, feature: 'dashboard' },
  { path: ROUTES.WORKSPACE, label: 'Workspace', icon: MessageSquare, feature: 'workspace' },
  { path: ROUTES.MONITORING, label: 'My Activity', icon: Activity, feature: 'monitoring' },
];

const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: 'Organization Admin',
  SECURITY_ADMIN: 'Security Admin',
  DATA_ENGINEER: 'Data Engineer',
  ANALYTICS_ENGINEER: 'Analytics Engineer',
  DATA_SCIENTIST: 'Data Scientist',
  BUSINESS_USER: 'Business User',
  VIEWER: 'Viewer',
};

export function Sidebar() {
  const { role, user, hasRole, hasFeature, logout } = useAuth();
  const isAdminRole = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'SECURITY_ADMIN', 'SECURITYADMIN'].some(r => hasRole(r));
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'ok' | 'degraded' | 'error'>('degraded');
  const [checkingHealth, setCheckingHealth] = useState(false);

  const visibleItems = (isAdminRole ? NAV_ITEMS : USER_NAV_ITEMS).filter((item) => !item.feature || hasFeature(item.feature));
  const sfAccount = localStorage.getItem('sf_account') || '—';
  const roleLabel = role ? (ROLE_LABELS[role] || role) : 'User';

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      const health = await mcpClient.getHealth();
      setBackendStatus(health.snowflake_connector_ready ? 'ok' : 'degraded');
    } catch {
      setBackendStatus('error');
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      animate={{ width: collapsed ? 64 : 260 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="h-full bg-[var(--color-surface-elevated)] border-r border-[var(--color-border)] flex flex-col shrink-0 relative overflow-hidden"
    >
      {/* Logo */}
      <div
        className="h-16 border-b border-[var(--color-border)] flex items-center shrink-0 px-4 relative"
        style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #f0fdfa 100%)' }}
      >
        <motion.div
          className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap"
          animate={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <span
            className="text-2xl font-bold italic leading-none shrink-0"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 50%, #3b82f6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 1px 2px rgba(37, 99, 235, 0.3))',
            }}
          >
            π
          </span>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <span className="text-[10px] font-medium text-amber-500 -mt-2 italic">by</span>
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs text-white shadow-sm shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  3
                </div>
                <div className="ml-0.5">
                  <div className="text-sm font-semibold text-[var(--color-text-main)] leading-none">π-Optimized</div>
                  <div className="text-[9px] text-[var(--color-text-light)] mt-0.5">Data Engineering Platform</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 flex flex-col overflow-hidden">
        {!collapsed && (
          <div className="mb-2 px-4">
            <span className="text-[10px] font-semibold text-[var(--color-text-light)] uppercase tracking-wider">
              Navigation
            </span>
          </div>
        )}

        <nav className={clsx('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {visibleItems.map((item, index) => {
            const isActive = location.pathname === item.path ||
              (item.path === ROUTES.DASHBOARD && location.pathname === '/');
            const Icon = item.icon;

            return (
              <NavLink key={item.path} to={item.path} className="block">
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.25 }}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative group/item',
                    collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2',
                    isActive
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface)]',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-[var(--color-accent-light)]/60 rounded-xl border border-[var(--color-accent)]/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className={clsx('w-[18px] h-[18px] shrink-0 relative z-10', isActive && 'text-[var(--color-accent)]')} />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="relative z-10 whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {isAdminRole && item.path === ROUTES.MONITORING && !collapsed && (
                    <Shield className="w-3 h-3 ml-auto text-[var(--color-accent)]/40 relative z-10" />
                  )}

                  {/* Tooltip for collapsed mode */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-[var(--color-text-main)] text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover/item:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </motion.div>
              </NavLink>
            );
          })}
        </nav>

        {/* Snowflake context */}
        <div className={clsx('mt-auto', collapsed ? 'px-2' : 'px-3')}>
          {!collapsed && (
            <div className="mb-2 px-1">
              <span className="text-[10px] font-semibold text-[var(--color-text-light)] uppercase tracking-wider">
                Connection
              </span>
            </div>
          )}
          <button
            onClick={checkHealth}
            className={clsx(
              'bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] transition-all w-full text-left hover:border-[var(--color-border-strong)]',
              collapsed ? 'p-2' : 'px-3 py-2.5',
            )}
          >
            <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'gap-2')}>
              <Database className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 min-w-0"
                  >
                    <span className="text-xs font-semibold text-[var(--color-text-main)] block truncate font-mono">{sfAccount}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`relative flex h-1.5 w-1.5`}>
                        {backendStatus === 'ok' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />}
                        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                          backendStatus === 'ok' ? 'bg-emerald-400' : backendStatus === 'degraded' ? 'bg-amber-400' : 'bg-red-400'
                        }`} />
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {backendStatus === 'ok' ? 'Connected' : backendStatus === 'degraded' ? 'Degraded' : 'Disconnected'}
                      </span>
                      {checkingHealth && <RefreshCw className="w-2.5 h-2.5 animate-spin text-[var(--color-text-light)]" />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </button>
        </div>
      </div>

      {/* Role badge + user menu */}
      <div className={clsx('border-t border-[var(--color-border)] shrink-0', collapsed ? 'px-2 py-3' : 'px-3 py-3')}>
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={clsx(
              'w-full flex items-center gap-2 rounded-xl text-xs font-medium transition-colors',
              collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2.5',
              isAdminRole
                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
            )}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  {roleLabel}
                </motion.span>
              )}
            </AnimatePresence>
            {!collapsed && (
              <span className="ml-auto text-[10px] font-mono opacity-50">{user?.name?.split(' ')[0]}</span>
            )}
          </button>

          {/* User dropdown menu */}
          <AnimatePresence>
            {showUserMenu && !collapsed && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden z-50"
              >
                <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
                  <div className="text-sm font-semibold text-[var(--color-text-main)]">{user?.name}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">{user?.email}</div>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-[72px] -right-3 w-6 h-6 bg-white border border-[var(--color-border)] rounded-full flex items-center justify-center text-[var(--color-text-light)] hover:text-[var(--color-text-main)] hover:border-[var(--color-border-strong)] shadow-sm transition-all z-30"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.div>
  );
}

