import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sun,
  Moon,
  Monitor as MonitorIcon,
  LogOut,
  User,
  Settings,
  ChevronDown,
  Command,
  Menu,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Avatar, Dropdown, DropdownItem, DropdownSeparator } from '../ui';
import { useAuth } from '../../auth';
import { ROUTES } from '../../constants/routes';

interface TopbarProps {
  onCommandOpen: () => void;
  sidebarCollapsed: boolean;
  onMobileMenuOpen?: () => void;
}

type ThemeMode = 'light' | 'dark' | 'system';

const PAGE_TITLES: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'Dashboard',
  [ROUTES.WORKSPACE]: 'Workspace',
  [ROUTES.SKILLS]: 'Skill Library',
  [ROUTES.MODELS]: 'Models',
  [ROUTES.USERS]: 'Users',
  [ROUTES.TEAMS]: 'Teams',
  [ROUTES.ANALYTICS]: 'Analytics',
  [ROUTES.MONITORING]: 'Monitoring',
  [ROUTES.GOVERNANCE]: 'Governance',
  [ROUTES.SETTINGS]: 'Settings',
};

export function Topbar({ onCommandOpen, sidebarCollapsed, onMobileMenuOpen }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('theme') as ThemeMode | null;
    return stored || 'system';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  };

  const themeIcon = theme === 'light'
    ? <Sun className="w-4 h-4" />
    : theme === 'dark'
    ? <Moon className="w-4 h-4" />
    : <MonitorIcon className="w-4 h-4" />;

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const displayName = user?.name || 'User';
  const email = user?.email || '';

  // Find current page title
  const pageTitle = Object.entries(PAGE_TITLES).find(([path]) =>
    path === ROUTES.DASHBOARD
      ? location.pathname === path
      : location.pathname.startsWith(path)
  )?.[1] ?? '';

  return (
    <header
      className={cn(
        'sticky top-0 z-[200] flex h-14 items-center justify-between border-b border-border/50 bg-background/90 backdrop-blur-xl px-4 gap-4',
        'transition-all duration-300',
      )}
      role="banner"
    >
      {/* Left: Mobile menu + Page title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuOpen}
          className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors lg:hidden shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile logo */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
            <span className="text-blue-400 font-bold text-xs" style={{ fontFamily: 'Syne, sans-serif' }}>π</span>
          </div>
        </div>

        {/* Desktop page title */}
        {pageTitle && (
          <h1
            className="hidden lg:block text-[15px] font-semibold text-foreground tracking-tight truncate"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            {pageTitle}
          </h1>
        )}
      </div>

      {/* Center: Command palette trigger */}
      <div className="flex-1 flex items-center justify-center max-w-xs mx-auto">
        <button
          onClick={onCommandOpen}
          className="group flex items-center justify-between w-full rounded-full border border-border/60 bg-surface/50 hover:bg-surface-hover hover:border-primary/30 px-3.5 py-1.5 text-sm text-muted transition-all duration-150"
          aria-label="Open command palette"
        >
          <div className="flex items-center gap-2">
            <Command className="w-3.5 h-3.5 text-muted/50 group-hover:text-primary/60 transition-colors" />
            <span className="text-[13px]">Search...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono font-medium rounded px-1.5 py-0.5 border border-border/60 text-muted/50">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme}`}
        >
          {themeIcon}
        </button>

        {/* User menu */}
        <Dropdown
          trigger={
            <button className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-surface-hover transition-colors">
              <Avatar
                initials={initials}
                alt={displayName}
                size="sm"
                className="bg-blue-500/15 text-blue-300 border border-blue-500/20"
              />
              <ChevronDown className="w-3.5 h-3.5 text-muted/60 hidden sm:block" />
            </button>
          }
          open={userMenuOpen}
          onOpenChange={setUserMenuOpen}
          align="end"
        >
          <div className="px-3 py-2.5 border-b border-border/50">
            <p className="text-sm font-semibold text-foreground">{displayName}</p>
            {email && <p className="text-xs text-muted mt-0.5">{email}</p>}
            {user?.role && (
              <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                {user.role}
              </span>
            )}
          </div>
          <DropdownItem icon={<User className="w-4 h-4" />} onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}>
            Profile
          </DropdownItem>
          <DropdownItem icon={<Settings className="w-4 h-4" />} onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}>
            Settings
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon={<LogOut className="w-4 h-4" />} destructive onClick={() => { logout(); navigate('/login'); }}>
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
