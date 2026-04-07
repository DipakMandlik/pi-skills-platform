import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, ChevronDown, Shield, Bell, Search, Command, User, Settings } from 'lucide-react';
import { useAuth } from '../../auth';
import { ROUTES } from '../../constants/routes';
import { clsx } from 'clsx';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  [ROUTES.DASHBOARD]: { title: 'Dashboard', subtitle: 'System overview' },
  [ROUTES.WORKSPACE]: { title: 'Workspace', subtitle: 'SQL chat & data explorer' },
  [ROUTES.SKILLS]: { title: 'Skills Management', subtitle: 'Create, assign & manage AI skills' },
  [ROUTES.MODELS]: { title: 'Model Access', subtitle: 'AI model governance' },
  [ROUTES.MONITORING]: { title: 'Monitoring', subtitle: 'Usage metrics & audit logs' },
};

const MOCK_NOTIFICATIONS = [
  { id: 'n1', title: 'New skill assigned', body: 'SQL Writer has been assigned to you', time: '2 min ago', unread: true },
  { id: 'n2', title: 'Query completed', body: 'Your SELECT query returned 247 rows', time: '5 min ago', unread: true },
  { id: 'n3', title: 'Model updated', body: 'Gemini 2.0 Flash is now available', time: '1 hour ago', unread: false },
];

export function Navbar() {
  const { user, role, permissions, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const pageInfo = PAGE_TITLES[location.pathname] || { title: 'π-Optimized' };
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="h-14 bg-[var(--color-panel)] border-b border-[var(--color-border)] flex items-center justify-between px-6 shrink-0">
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
        {permissions.manageUsers && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Admin
          </span>
        )}
      </motion.div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search hint */}
        <button className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-light)] hover:border-[var(--color-border-strong)] transition-colors">
          <Search className="w-3.5 h-3.5" />
          <span>Search...</span>
          <kbd className="ml-4 text-[10px] font-mono bg-white border border-[var(--color-border)] rounded px-1 py-0.5">⌘K</kbd>
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={clsx(
              'p-2 rounded-xl transition-colors relative',
              showNotifications
                ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-light)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface)]',
            )}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--color-accent)] text-white text-[9px] font-bold flex items-center justify-center">
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
                className="absolute right-0 top-full mt-1 w-80 bg-white border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-text-main)]">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-semibold text-[var(--color-accent)] bg-[var(--color-accent-light)] px-1.5 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
                  {MOCK_NOTIFICATIONS.map((notif) => (
                    <div
                      key={notif.id}
                      className={clsx(
                        'px-4 py-3 hover:bg-[var(--color-surface)] transition-colors cursor-pointer',
                        notif.unread && 'bg-blue-50/50',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        {notif.unread && (
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-sm', notif.unread ? 'font-semibold text-[var(--color-text-main)]' : 'text-[var(--color-text-main)]')}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{notif.body}</p>
                          <p className="text-[10px] text-[var(--color-text-light)] mt-1">{notif.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
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
              'flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-colors',
              showUserMenu ? 'bg-[var(--color-surface)]' : 'hover:bg-[var(--color-surface)]',
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-secondary)] flex items-center justify-center text-white text-xs font-bold shadow-sm">
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
                className="absolute right-0 top-full mt-1 w-56 bg-white border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50"
              >
                <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
                  <div className="text-sm font-semibold text-[var(--color-text-main)]">{user?.name}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">{user?.email}</div>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => { setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-main)] hover:bg-[var(--color-surface)] rounded-lg transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    Profile
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-main)] hover:bg-[var(--color-surface)] rounded-lg transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    Settings
                  </button>
                </div>
                <div className="border-t border-[var(--color-border)] p-1">
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
