import { useState, useCallback, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Brain,
  Users,
  UserCog,
  BarChart3,
  Settings,
  Shield,
  Layers,
  PanelLeftClose,
  PanelLeft,
  Monitor,
  Activity,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { ROUTES, type RoutePath } from '../../constants/routes';
import { useAuth } from '../../auth/useAuth';

interface NavItem {
  path: RoutePath;
  label: string;
  icon: ReactNode;
  section?: string;
  feature?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: <LayoutDashboard className="w-[18px] h-[18px]" />, section: 'Overview', feature: 'dashboard' },
  { path: ROUTES.WORKSPACE, label: 'Workspace', icon: <Layers className="w-[18px] h-[18px]" />, section: 'Platform', feature: 'workspace' },
  { path: ROUTES.SKILLS, label: 'Skill Library', icon: <Brain className="w-[18px] h-[18px]" />, section: 'Platform', feature: 'skills' },
  { path: ROUTES.MODELS, label: 'Models', icon: <Monitor className="w-[18px] h-[18px]" />, section: 'Platform', feature: 'models' },
  { path: ROUTES.USERS, label: 'Users', icon: <Users className="w-[18px] h-[18px]" />, section: 'Organization', feature: 'users' },
  { path: ROUTES.TEAMS, label: 'Teams', icon: <UserCog className="w-[18px] h-[18px]" />, section: 'Organization', feature: 'teams' },
  { path: ROUTES.ANALYTICS, label: 'Analytics', icon: <BarChart3 className="w-[18px] h-[18px]" />, section: 'Insights', feature: 'analytics' },
  { path: ROUTES.MONITORING, label: 'Monitoring', icon: <Activity className="w-[18px] h-[18px]" />, section: 'Insights', feature: 'monitoring' },
  { path: ROUTES.GOVERNANCE, label: 'Governance', icon: <Shield className="w-[18px] h-[18px]" />, section: 'Admin', feature: 'governance_admin' },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: <Settings className="w-[18px] h-[18px]" />, section: 'Admin', feature: 'settings' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  ORG_ADMIN: 'Admin',
  user: 'Member',
  viewer: 'Viewer',
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const { user, hasFeature } = useAuth();

  const handleNavigate = useCallback((path: RoutePath) => {
    navigate(path);
    onMobileClose?.();
  }, [navigate, onMobileClose]);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.feature) return true;
    return hasFeature(item.feature);
  });

  const groupedItems = visibleItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const section = item.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  const userInitials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const roleLabel = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : 'Member';

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 px-3 border-b border-white/[0.05]',
        collapsed ? 'justify-center' : 'justify-between',
      )}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5"
          >
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
              <span className="text-blue-400 font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>π</span>
            </div>
            <div>
              <span className="font-semibold text-white text-[13px] tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>Skills Platform</span>
              <div className="text-[10px] text-[var(--color-shell-text)] font-medium -mt-0.5 tracking-wide">Governance Platform</div>
            </div>
          </motion.div>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
            <span className="text-blue-400 font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>π</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            'p-1.5 rounded-md text-[var(--color-shell-text)] hover:text-white hover:bg-white/5 transition-colors',
            collapsed && 'hidden',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
        {collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-[var(--color-shell-text)] hover:text-white hover:bg-white/5 transition-colors absolute bottom-[72px] left-1/2 -translate-x-1/2"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section}>
            {!collapsed && (
              <div className="px-3 mb-1 text-[10px] font-semibold text-[var(--color-shell-text)] uppercase tracking-[0.08em]">
                {section}
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== ROUTES.DASHBOARD && location.pathname.startsWith(item.path));
                return (
                  <div
                    key={item.path}
                    className="relative"
                    onMouseEnter={() => collapsed && setTooltip(item.label)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <button
                      onClick={() => handleNavigate(item.path)}
                      className={cn(
                        'flex w-full items-center gap-3 text-[13px] font-medium transition-all duration-150 rounded-md relative',
                        collapsed ? 'justify-center py-2.5 px-0' : 'py-[7px] px-3',
                        isActive
                          ? 'bg-blue-500/10 text-white'
                          : 'text-[var(--color-shell-text)] hover:text-white hover:bg-white/[0.04]',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {isActive && !collapsed && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-blue-400" />
                      )}
                      <span className={cn(
                        'shrink-0 transition-colors',
                        isActive ? 'text-blue-400' : '',
                      )}>{item.icon}</span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                    {collapsed && tooltip === item.label && (
                      <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-[600] pointer-events-none">
                        <div className="bg-[#1a1a22] text-white text-xs font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-xl border border-white/10">
                          {item.label}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className={cn('border-t border-white/[0.05]', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-300 text-[11px] font-semibold">
              {userInitials}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md bg-white/[0.03] border border-white/[0.05]">
            <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-300 text-[11px] font-semibold shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-white truncate leading-tight">
                {user?.name || user?.email?.split('@')[0] || 'User'}
              </div>
              <div className="text-[10px] text-[var(--color-shell-text)] truncate leading-tight mt-0.5">
                {roleLabel}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-[699] lg:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[260px] bg-[var(--color-shell)] z-[700] lg:hidden"
            >
              <div className="absolute top-3 right-3">
                <button
                  onClick={onMobileClose}
                  className="p-1.5 rounded-md text-[var(--color-shell-text)] hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col border-r border-white/[0.05] bg-[var(--color-shell)] transition-all duration-300 ease-in-out',
          collapsed ? 'w-[60px]' : 'w-[240px]',
          'h-full z-20 relative',
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
