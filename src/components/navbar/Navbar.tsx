import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, ChevronDown, Shield, Bell, Search, User, Settings, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../../auth';
import { ROUTES } from '../../constants/routes';
import { clsx } from 'clsx';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  [ROUTES.DASHBOARD]: { title: 'Dashboard', subtitle: 'System overview' },
  [ROUTES.WORKSPACE]: { title: 'Workspace', subtitle: 'SQL chat & data explorer' },
  [ROUTES.SKILLS]: { title: 'Skills Management', subtitle: 'Create, assign & manage AI skills' },
  [ROUTES.MODELS]: { title: 'Model Access', subtitle: 'AI model governance' },
  [ROUTES.MONITORING]: { title: 'Monitoring', subtitle: 'Usage metrics & audit logs' },
  [ROUTES.GOVERNANCE]: { title: 'AI Governance', subtitle: 'Subscriptions, models & feature flags' },
};

interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  type: 'skill' | 'query' | 'system' | 'access';
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: 'Snowflake connected', body: 'Your session is active', time: 'Just now', unread: true, type: 'system' },
];

export function Navbar() {
  const { user, role, hasRole, logout } = useAuth();
  const isAdmin = ['ORG_ADMIN', 'ACCOUNTADMIN', 'SYSADMIN', 'SECURITY_ADMIN', 'SECURITYADMIN'].some(r => hasRole(r));
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const pageInfo = PAGE_TITLES[location.pathname] || { title: 'π-Optimized' };
  const unreadCount = notifications.filter((n) => n.unread).length;
  const sfAccount = localStorage.getItem('sf_account') || '';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, unread: false } : n));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <div className="h-14 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] flex items-center justify-between px-6 shrink-0">
      {/* Page info */}
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3"
      >
        <div>
          <h1 className="text-base font-bold text-[var(--color-text-main)] leading-none">{pageInfo.title}</h1>
          {pageInfo.subtitle && (
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{pageInfo.subtitle}</p>
          )}
        </div>
        {isAdmin && (
          <span className="text-[10px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-light)] px-2 py-0.5 rounded-full uppercase tracking-wider">
            Admin
          </span>
        )}
      </motion.div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Account display */}
        {sfAccount && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--color-surface)] rounded-lg text-[11px] font-mono text-[var(--color-text-muted)]">
            <Shield className="w-3 h-3" />
            {sfAccount}
          </div>
        )}

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={clsx(
              'p-2 rounded-lg transition-colors duration-150 relative',
              showNotifications
                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-light)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface)]',
            )}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-[9px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-80 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-text-main)]">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => markAsRead(notif.id)}
                        className={clsx(
                          'px-4 py-3 hover:bg-[var(--color-surface-hover)] transition-colors duration-150 cursor-pointer',
                          notif.unread && 'bg-[var(--color-primary-light)]',
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          {notif.unread && (
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={clsx('text-sm', notif.unread ? 'font-semibold' : '')}>{notif.title}</p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{notif.body}</p>
                            <p className="text-[10px] text-[var(--color-text-light)] mt-1">{notif.time}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--color-border)]" />

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={clsx(
              'flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors duration-150',
              showUserMenu ? 'bg-[var(--color-surface)]' : 'hover:bg-[var(--color-surface)]',
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium text-[var(--color-text-main)] leading-none">{user?.name}</div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{role}</div>
            </div>
            <ChevronDown className={clsx(
              'w-3.5 h-3.5 text-[var(--color-text-light)] transition-transform hidden sm:block',
              showUserMenu && 'rotate-180',
            )} />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-56 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50"
              >
                <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
                  <div className="text-sm font-semibold text-[var(--color-text-main)]">{user?.name}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] font-mono">{sfAccount}</div>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => { setShowUserMenu(false); navigate(ROUTES.DASHBOARD); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-main)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors duration-150"
                  >
                    <User className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); navigate(ROUTES.WORKSPACE); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-main)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors duration-150"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    Workspace
                  </button>
                </div>
                <div className="border-t border-[var(--color-border)] p-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-light)] rounded-lg transition-colors duration-150"
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
    </div>
  );
}
