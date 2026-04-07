import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { Breadcrumbs } from '../components/layout/Breadcrumbs';
import { CommandPalette } from '../components/ui/CommandPalette';
import { Brain, Users, BarChart3, Settings, Shield, Layers, Monitor, LayoutDashboard, Plus, UserCog } from 'lucide-react';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../auth';

function useSidebarState() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    return stored === 'true';
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  return { collapsed, toggle, setCollapsed };
}

export function AppLayout() {
  const { hasFeature } = useAuth();
  const { collapsed, toggle, setCollapsed } = useSidebarState();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname.startsWith(ROUTES.DASHBOARD);
  const isWorkspace = location.pathname.startsWith(ROUTES.WORKSPACE);

  useEffect(() => {
    if (isWorkspace && !collapsed) {
      setCollapsed(true);
      localStorage.setItem('sidebar-collapsed', 'true');
    }
  }, [isWorkspace, collapsed, setCollapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const commandItems = [
    { id: 'dashboard', label: 'Go to Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, section: 'Navigation', action: () => navigate(ROUTES.DASHBOARD), feature: 'dashboard' },
    { id: 'skills', label: 'Skill Library', icon: <Brain className="w-4 h-4" />, section: 'Navigation', action: () => navigate(ROUTES.SKILLS), feature: 'skills' },
    { id: 'workspace', label: 'Workspace', icon: <Layers className="w-4 h-4" />, section: 'Navigation', action: () => navigate(ROUTES.WORKSPACE), feature: 'workspace' },
    { id: 'models', label: 'Models', icon: <Monitor className="w-4 h-4" />, section: 'Navigation', action: () => navigate(ROUTES.MODELS), feature: 'models' },
    { id: 'users', label: 'User Management', icon: <Users className="w-4 h-4" />, section: 'Organization', action: () => navigate(ROUTES.USERS), feature: 'users' },
    { id: 'teams', label: 'Team Management', icon: <UserCog className="w-4 h-4" />, section: 'Organization', action: () => navigate(ROUTES.TEAMS), feature: 'teams' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, section: 'Insights', action: () => navigate(ROUTES.ANALYTICS), feature: 'analytics' },
    { id: 'monitoring', label: 'Monitoring', icon: <Shield className="w-4 h-4" />, section: 'Insights', action: () => navigate(ROUTES.MONITORING), feature: 'monitoring' },
    { id: 'governance', label: 'Governance', icon: <Shield className="w-4 h-4" />, section: 'Admin', action: () => navigate(ROUTES.GOVERNANCE), feature: 'governance_admin' },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, section: 'Admin', action: () => navigate(ROUTES.SETTINGS), feature: 'settings' },
    { id: 'create-skill', label: 'Create New Skill', icon: <Plus className="w-4 h-4" />, shortcut: 'N', section: 'Actions', action: () => navigate(ROUTES.SKILL_STUDIO_NEW), feature: 'skills' },
  ];

  const visibleCommandItems = commandItems.filter((item) => !item.feature || hasFeature(item.feature));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0">
        {isDashboard && (
          <Topbar
            onCommandOpen={() => setCommandOpen(true)}
            sidebarCollapsed={collapsed}
            onMobileMenuOpen={() => setMobileMenuOpen(true)}
          />
        )}
        {isWorkspace ? (
          <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <Outlet />
          </main>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 sm:px-6 py-4">
              <Breadcrumbs />
            </div>
            <main className="px-4 sm:px-6 pb-6">
              <Outlet />
            </main>
          </div>
        )}
      </div>
      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} items={visibleCommandItems} />
    </div>
  );
}
